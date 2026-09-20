import type { Page } from "playwright";

import { type BlockedRequestEvent, createAllowListRouteHandler, isAllowedUrl, SAFE_ALLOWED_ORIGINS } from "../allowList.ts";
import { type ActionOutcome, executeAction } from "../browser/actions.ts";
import { closeBrowserSession, launchBrowserSession } from "../browser/browserSession.ts";
import { evaluateCondition } from "../browser/conditions.ts";
import { BROWSER_TARGET_DESCRIPTION, type TargetDescription } from "../browser/targetDescription.ts";
import type { RunnerConfig } from "../config.ts";
import { resolveCredential } from "../credentials.ts";
import type { ExecutionContext } from "../dsl/executionContext.ts";
import { createOutputsState } from "../dsl/outputsState.ts";
import type { ChildStep, RecipeDefinition, Recovery } from "../dsl/types.ts";
import { log } from "../logger.ts";
import {
	type ClaimedRecipeJob,
	fetchJobStatus,
	fetchPendingCommand,
	JobStatus,
	type PendingCommand,
	reportCommandResult,
	reportDslStep,
	reportInfo,
	reportStatus,
	TERMINAL_JOB_STATUSES
} from "../runnerClient.ts";
import { redactKnownSecrets } from "../textRedaction.ts";

import { collectCredentialNames } from "./program/credentialNames.ts";
import { buildLocationIndex, type Location } from "./program/locationIndex.ts";
import { captureAndUploadArtifact, reportBlockedRequests, scalarToWireValue, type StepReportingDeps } from "./stepReporting.ts";

const RECOVERY_POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A single Step occurrence's result, once its own outcome (and any triggered recovery) has been
// resolved — this is what the interpreter loop advances on.
type SequenceOutcome =
	| { type: "advance" }
	| { type: "goto"; target: string }
	| { type: "finish" }
	| { type: "fail"; error: { code: string; message: string } }
	| { type: "intervention"; stepId: string }
	| { type: "error"; message: string };

interface Position {
	topIndex: number;
	resume?: { array: ChildStep[]; childIndex: number };
}

function collectSecretValues(recipe: RecipeDefinition, ingredients: Record<string, string | number | boolean>, resolveCredentialFn: (name: string) => string): string[] {
	const secrets: string[] = [];
	for (const [name, declaration] of Object.entries(recipe.inputs)) {
		if (declaration.sensitive && Object.prototype.hasOwnProperty.call(ingredients, name)) {
			secrets.push(String(ingredients[name]));
		}
	}
	for (const name of collectCredentialNames(recipe)) {
		secrets.push(resolveCredentialFn(name));
	}
	return secrets.filter((value) => value.trim() !== "");
}

interface LoopDeps {
	config: RunnerConfig;
	job: ClaimedRecipeJob;
	ctx: ExecutionContext;
	page: Page;
	secrets: string[];
	recoveryAttempts: Map<string, number>;
	blockedEvents: BlockedRequestEvent[];
}

// A bound on how many times any single recoverable scenario can run within one Job — a Recipe
// whose recovery condition stays true after its own recovery Steps run (a misconfigured or
// ineffective recovery) would otherwise keep re-applying it after every subsequent Step forever.
const MAX_RECOVERY_ATTEMPTS = 3;

// Adapts a Recipe loop's LoopDeps to the shape stepReporting.ts's shared helpers need — reused as-is
// by trainingLoop.ts's own LoopDeps, since both carry a ClaimedJob-like `job` plus the same
// config/page/secrets/blockedEvents.
function stepReportingDeps(deps: LoopDeps): StepReportingDeps {
	return { config: deps.config, jobId: deps.job.id, artifactsUrl: deps.job.comms.artifactsUrl, page: deps.page, secrets: deps.secrets, blockedEvents: deps.blockedEvents };
}

// Runs one non-structural Step, reports its transcript row + screenshot, then resolves whether
// the interpreter loop should advance, jump, stop, or ask for help. `insideRecovery` disables the
// post-step recoverable-scenario scan while a recovery's own Steps are running, so a recovery
// never triggers another recovery.
async function runStepAndReport(deps: LoopDeps, recipe: RecipeDefinition, step: ChildStep, parentStepId: string | undefined, insideRecovery: boolean): Promise<SequenceOutcome> {
	let actionResult: ActionOutcome;
	try {
		actionResult = await executeAction(deps.page, step, deps.ctx);
	}
	catch (err: unknown) {
		await reportBlockedRequests(stepReportingDeps(deps), step.id);
		// No ActionOutcome exists, so the target is unknown; "browser" matches what `open` reports.
		await reportDslStep(deps.config, deps.job.id, {
			stepId: step.id,
			outcome: "failed",
			...(parentStepId !== undefined ? { parentStepId } : {}),
			extractions: [],
			targetDescription: BROWSER_TARGET_DESCRIPTION
		});
		const rawMessage = err instanceof Error ? err.message : String(err);
		return { type: "error", message: redactKnownSecrets(`Unexpected error executing step ${step.id}: ${rawMessage}`, deps.secrets) };
	}

	// The route handler catches disallowed requests that hit the network stack before they're sent;
	// `isAllowedUrl(page.url(), ...)` is the backstop for navigations Playwright's interception can't
	// see at all (data:/about:/blob:), so both are checked here.
	const blockedNavigationUrl = await reportBlockedRequests(stepReportingDeps(deps), step.id);
	if (blockedNavigationUrl !== undefined || !isAllowedUrl(deps.page.url(), [...deps.job.controls.allowedOrigins, ...SAFE_ALLOWED_ORIGINS])) {
		// Not reportChildOutcome: it screenshots, and the page is on a disallowed origin.
		await reportDslStep(deps.config, deps.job.id, {
			stepId: step.id,
			outcome: "failed",
			...(parentStepId !== undefined ? { parentStepId } : {}),
			extractions: [],
			targetDescription: actionResult.targetDescription
		});
		return { type: "error", message: redactKnownSecrets(`Step ${step.id} navigated to a disallowed origin: ${blockedNavigationUrl ?? deps.page.url()}`, deps.secrets) };
	}

	if (actionResult.kind === "businessFailure") {
		await reportChildOutcome(deps, step.id, "failed", parentStepId, [], actionResult.targetDescription);
		return { type: "fail", error: actionResult.error! };
	}

	growSecretsFromExtraction(deps, recipe, actionResult);
	const extractions = toWireExtractions(actionResult);

	if (actionResult.outcome === "failed") {
		if (actionResult.error) {
			await reportInfo(deps.config, deps.job.id, redactKnownSecrets(`Step ${step.id} failed: ${actionResult.error.code}: ${actionResult.error.message}`, deps.secrets));
		}
		await reportChildOutcome(deps, step.id, "failed", parentStepId, extractions, actionResult.targetDescription);
		if (!insideRecovery) {
			const recovered = await runRecoveryScan(deps, recipe);
			if (recovered) {
				return recovered.type === "ran" ? { type: "advance" } : recovered.outcome;
			}
		}
		return { type: "intervention", stepId: step.id };
	}

	await reportChildOutcome(deps, step.id, "succeeded", parentStepId, extractions, actionResult.targetDescription);

	if (!insideRecovery) {
		const recovered = await runRecoveryScan(deps, recipe);
		if (recovered) {
			// Recovery ran (or produced its own terminal/goto outcome) — that supersedes this
			// step's own goto/finish per the "continue at the next Step" simplification.
			return recovered.type === "ran" ? { type: "advance" } : recovered.outcome;
		}
	}

	if (actionResult.gotoStepId !== undefined) {
		return { type: "goto", target: actionResult.gotoStepId };
	}
	if (actionResult.finished) {
		return { type: "finish" };
	}
	return { type: "advance" };
}

// Mirrors collectSecretValues' recipe.inputs[name].sensitive check, but for outputs: a
// declared-sensitive output is only known once its Step extracts it mid-Job, so it's added to
// deps.secrets here rather than up front, protecting every screenshot/message from that point on.
function growSecretsFromExtraction(deps: LoopDeps, recipe: RecipeDefinition, actionResult: ActionOutcome): void {
	if (!actionResult.extraction) {
		return;
	}
	const declaration = recipe.outputs[actionResult.extraction.fieldName];
	if (!declaration?.sensitive) {
		return;
	}
	const value = scalarToWireValue(actionResult.extraction.value);
	if (value.trim() !== "" && !deps.secrets.includes(value)) {
		deps.secrets.push(value);
	}
}

function toWireExtractions(actionResult: ActionOutcome): Array<{ fieldName: string; value: string }> {
	if (!actionResult.extraction) {
		return [];
	}
	return [{ fieldName: actionResult.extraction.fieldName, value: scalarToWireValue(actionResult.extraction.value) }];
}

async function reportChildOutcome(
	deps: LoopDeps,
	stepId: string,
	outcome: "succeeded" | "failed",
	parentStepId: string | undefined,
	extractions: Array<{ fieldName: string; value: string }>,
	targetDescription: TargetDescription
): Promise<void> {
	await reportDslStep(deps.config, deps.job.id, {
		stepId,
		outcome,
		...(parentStepId !== undefined ? { parentStepId } : {}),
		extractions,
		targetDescription
	});
	await captureAndUploadArtifact(stepReportingDeps(deps), stepId);
}

async function runChildSequence(deps: LoopDeps, recipe: RecipeDefinition, children: ChildStep[], startIndex: number, parentStepId: string | undefined, insideRecovery: boolean): Promise<SequenceOutcome> {
	for (let i = startIndex; i < children.length; i++) {
		const outcome = await runStepAndReport(deps, recipe, children[i], parentStepId, insideRecovery);
		if (outcome.type !== "advance") {
			// A child's goto/finish/fail/intervention/error leaves the parent group/if immediately —
			// remaining siblings are not run.
			return outcome;
		}
	}
	return { type: "advance" };
}

type RecoveryResult = { type: "ran" } | { type: "outcome"; outcome: SequenceOutcome };

// Checks each Recovery's `when` in order; the first match runs, and its own failure escalates to
// intervention rather than falling through to a later Recovery.
async function runRecoveryScan(deps: LoopDeps, recipe: RecipeDefinition): Promise<RecoveryResult | undefined> {
	for (const recovery of recipe.recoveries) {
		const attempts = deps.recoveryAttempts.get(recovery.id) ?? 0;
		if (attempts >= MAX_RECOVERY_ATTEMPTS) {
			continue;
		}
		if (await evaluateCondition(deps.page, recovery.when, deps.ctx)) {
			deps.recoveryAttempts.set(recovery.id, attempts + 1);
			return runRecovery(deps, recipe, recovery);
		}
	}
	return undefined;
}

async function runRecovery(deps: LoopDeps, recipe: RecipeDefinition, recovery: Recovery): Promise<RecoveryResult> {
	const outcome = await runChildSequence(deps, recipe, recovery.steps, 0, recovery.id, true);
	if (outcome.type === "advance") {
		return { type: "ran" };
	}
	// A recovery Step's own ordinary failure escalates straight to intervention (still naming that
	// Step) rather than attempting a nested recovery.
	return { type: "outcome", outcome };
}

function toPosition(location: Location): Position {
	return location.level === "top" ? { topIndex: location.topIndex } : { topIndex: location.topIndex, resume: { array: location.array, childIndex: location.childIndex } };
}

// The shared Automatic Loop interpreter: walks the Recipe's top-level Steps, descending into
// group/if children and reconstructing goto continuations, until a terminal SequenceOutcome
// (finish/fail/intervention/error) is reached.
async function runProgram(deps: LoopDeps, recipe: RecipeDefinition, startStepId?: string): Promise<Exclude<SequenceOutcome, { type: "advance" | "goto" }>> {
	const locationIndex = buildLocationIndex(recipe.steps);
	let pos: Position = { topIndex: 0 };
	if (startStepId !== undefined) {
		const start = locationIndex.get(startStepId);
		if (!start) {
			return { type: "error", message: `Resume step not found: ${startStepId}` };
		}
		pos = toPosition(start);
	}

	for (;;) {
		if (pos.topIndex >= recipe.steps.length) {
			return { type: "error", message: "Recipe steps exhausted without reaching a finish Step" };
		}

		const step = recipe.steps[pos.topIndex];
		let outcome: SequenceOutcome;

		if (step.action === "group") {
			const children = step.args[0];
			const startIndex = pos.resume && pos.resume.array === children ? pos.resume.childIndex : 0;
			outcome = await runChildSequence(deps, recipe, children, startIndex, step.id, false);
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			let chosen: ChildStep[] | undefined = pos.resume?.array;
			if (!chosen) {
				for (const ifCase of cases) {
					if (await evaluateCondition(deps.page, ifCase.when, deps.ctx)) {
						chosen = ifCase.steps;
						break;
					}
				}
				chosen ??= elseSteps;
			}
			const startIndex = pos.resume ? pos.resume.childIndex : 0;
			outcome = await runChildSequence(deps, recipe, chosen, startIndex, step.id, false);
		}
		else {
			outcome = await runChildSequence(deps, recipe, [step], 0, undefined, false);
		}

		if (outcome.type === "advance") {
			pos = { topIndex: pos.topIndex + 1 };
			continue;
		}
		if (outcome.type === "goto") {
			const location = locationIndex.get(outcome.target);
			if (!location) {
				return { type: "error", message: `goto target not found: ${outcome.target}` };
			}
			pos = toPosition(location);
			continue;
		}
		return outcome;
	}
}

function commandToStep(command: PendingCommand): ChildStep {
	switch (command.kind) {
		case "click":
			return { id: command.stepId, action: "click", args: [{ by: "point", x: command.payload.x, y: command.payload.y }] };
		case "assign":
			return { id: command.stepId, action: "assign", args: [{ ref: "output", name: command.payload.name }, command.payload.value] };
		case "prompt":
			return { ...command.payload.step, id: command.stepId };
	}
}

// Runs one operator command through the same executeAction/allowlist path as a Recipe Step. Returns
// false when the Job must end. A result Hub refuses (the Job left Interactive-User mid-command) is
// discarded here, and the wait loop's next status read exits per the new status.
async function runCommand(deps: LoopDeps, command: PendingCommand): Promise<boolean> {
	const step = commandToStep(command);
	const failWithError = async (targetDescription: TargetDescription, message: string): Promise<false> => {
		// A refused result means the Job already left Interactive-User; that newer status must not be overwritten.
		if (await reportCommandResult(deps.config, deps.job.id, command.id, { outcome: "failed", targetDescription })) {
			await reportStatus(deps.config, deps.job.id, JobStatus.CompletedError, redactKnownSecrets(message, deps.secrets));
		}
		return false;
	};

	let actionResult: ActionOutcome;
	try {
		actionResult = await executeAction(deps.page, step, deps.ctx);
	}
	catch (err: unknown) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		return failWithError(BROWSER_TARGET_DESCRIPTION, `Unexpected error executing command ${step.id}: ${rawMessage}`);
	}

	const blockedNavigationUrl = await reportBlockedRequests(stepReportingDeps(deps), step.id);
	if (blockedNavigationUrl !== undefined || !isAllowedUrl(deps.page.url(), [...deps.job.controls.allowedOrigins, ...SAFE_ALLOWED_ORIGINS])) {
		return failWithError(actionResult.targetDescription, `Command ${step.id} navigated to a disallowed origin: ${blockedNavigationUrl ?? deps.page.url()}`);
	}

	const accepted = await reportCommandResult(deps.config, deps.job.id, command.id, { outcome: actionResult.outcome, targetDescription: actionResult.targetDescription });
	if (accepted) {
		// The overlay waits on this screenshot, and one taken mid-navigation (a click on a link) fails, so retry once the page settles.
		if (!(await captureAndUploadArtifact(stepReportingDeps(deps), step.id))) {
			await deps.page.waitForLoadState();
			await captureAndUploadArtifact(stepReportingDeps(deps), step.id);
		}
	}
	return true;
}

type InterventionResult = { type: "ended" } | { type: "resume"; stepId: string };

// Keeps the same browser/page open and follows the Hub-owned status. The timeout is a wait for a
// human until an operator takes control, then restarts as an idle timeout once they do. Status is
// read before the deadline is judged so a takeover just before expiry is never failed by mistake.
// A hand-back is answered by reporting Running (which releases the owner) and returning the Step to resume at.
async function waitForIntervention(deps: LoopDeps, interventionTimeoutSeconds: number): Promise<InterventionResult> {
	const timeoutMs = interventionTimeoutSeconds * 1000;
	let deadline = Date.now() + timeoutMs;
	let takenOver = false;
	for (;;) {
		await sleep(Math.min(RECOVERY_POLL_INTERVAL_MS, Math.max(deadline - Date.now(), 0)));
		const { statusId, resumeStepId } = await fetchJobStatus(deps.config, deps.job.comms.statusUrl);
		if (TERMINAL_JOB_STATUSES.includes(statusId)) {
			return { type: "ended" };
		}
		if (statusId !== JobStatus.InterventionRequested && statusId !== JobStatus.InteractiveUser) {
			await reportStatus(deps.config, deps.job.id, JobStatus.CompletedError, `Unexpected status change to ${statusId} during intervention`);
			return { type: "ended" };
		}
		if (statusId === JobStatus.InteractiveUser && resumeStepId !== null) {
			await reportStatus(deps.config, deps.job.id, JobStatus.Running, `Resuming at step ${resumeStepId}`);
			return { type: "resume", stepId: resumeStepId };
		}
		if (statusId === JobStatus.InteractiveUser && !takenOver) {
			takenOver = true;
			deadline = Date.now() + timeoutMs;
		}
		if (statusId === JobStatus.InteractiveUser) {
			const command = await fetchPendingCommand(deps.config, deps.job.id);
			if (command) {
				if (!(await runCommand(deps, command))) {
					return { type: "ended" };
				}
				deadline = Date.now() + timeoutMs;
				continue;
			}
		}
		if (Date.now() >= deadline) {
			await reportStatus(
				deps.config,
				deps.job.id,
				JobStatus.CompletedFailed,
				takenOver ? "Interactive session idle timed out" : "Intervention timed out with no human recovery"
			);
			return { type: "ended" };
		}
	}
}

// Runs a Recipe (Trial/Execute) Job end to end: the Automatic Loop, recovery scanning, and (on an
// unrecoverable Step failure) the Intervention wait — cleaning up the browser session on every
// terminal exit path before returning control to the poll loop.
export async function runRecipeJobLoop(config: RunnerConfig, job: ClaimedRecipeJob, interventionTimeoutSeconds: number): Promise<void> {
	const blockedEvents: BlockedRequestEvent[] = [];
	const routeHandler = createAllowListRouteHandler([...job.controls.allowedOrigins, ...SAFE_ALLOWED_ORIGINS], (event) => blockedEvents.push(event));
	const secrets = collectSecretValues(job.recipe, job.ingredients, resolveCredential);

	let session;
	try {
		session = await launchBrowserSession(routeHandler);
	}
	catch (err: unknown) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		log(redactKnownSecrets(`job ${job.id}: failed to launch a browser session, abandoning back to polling: ${rawMessage}`, secrets));
		await reportStatus(config, job.id, JobStatus.CompletedError, redactKnownSecrets(`Failed to launch a browser session: ${rawMessage}`, secrets)).catch(() => undefined);
		return;
	}

	session.page.setDefaultTimeout(job.stepTimeoutMs);

	const ctx: ExecutionContext = {
		ingredients: job.ingredients,
		outputs: createOutputsState(),
		stepTimeoutMs: job.stepTimeoutMs,
		resolveCredential,
		secrets
	};
	const deps: LoopDeps = {
		config,
		job,
		ctx,
		page: session.page,
		secrets,
		recoveryAttempts: new Map(),
		blockedEvents
	};

	try {
		let startStepId: string | undefined;
		for (;;) {
			const outcome = await runProgram(deps, job.recipe, startStepId);

			if (outcome.type === "error") {
				await reportStatus(config, job.id, JobStatus.CompletedError, outcome.message);
			}
			else if (outcome.type === "fail") {
				await reportStatus(config, job.id, JobStatus.CompletedFailed, redactKnownSecrets(`${outcome.error.code}: ${outcome.error.message}`, secrets));
			}
			else if (outcome.type === "finish") {
				await reportStatus(config, job.id, JobStatus.CompletedSuccess, "Recipe finished");
			}
			else {
				await reportStatus(
					config,
					job.id,
					JobStatus.InterventionRequested,
					redactKnownSecrets(`Step ${outcome.stepId} failed with no matching recoverable scenario`, secrets),
					outcome.stepId
				);
				const interventionResult = await waitForIntervention(deps, interventionTimeoutSeconds);
				if (interventionResult.type === "resume") {
					startStepId = interventionResult.stepId;
					continue;
				}
			}
			break;
		}
	}
	catch (err: unknown) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		log(redactKnownSecrets(`job ${job.id}: recipe loop failed unexpectedly, abandoning back to polling: ${rawMessage}`, secrets));
	}
	finally {
		await captureAndUploadArtifact(stepReportingDeps(deps), "terminal");
		await closeBrowserSession(session);
		log(`job ${job.id}: recipe loop finished, resuming polling`);
	}
}
