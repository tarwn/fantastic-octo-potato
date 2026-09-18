import type { Page } from "playwright";

import { type BlockedRequestEvent, createAllowListRouteHandler, isAllowedUrl, SAFE_ALLOWED_ORIGINS } from "../allowList.ts";
import { type ActionOutcome, executeAction } from "../browser/actions.ts";
import { closeBrowserSession, launchBrowserSession } from "../browser/browserSession.ts";
import { evaluateCondition } from "../browser/conditions.ts";
import { takeMaskedScreenshot } from "../browser/screenshotMasking.ts";
import type { RunnerConfig } from "../config.ts";
import { resolveCredential } from "../credentials.ts";
import type { ExecutionContext } from "../dsl/executionContext.ts";
import { createOutputsState } from "../dsl/outputsState.ts";
import type { ChildStep, RecipeDefinition, Recovery, ScalarValue } from "../dsl/types.ts";
import { log } from "../logger.ts";
import {
	type ClaimedRecipeJob,
	fetchJobStatus,
	JobStatus,
	reportDslStep,
	reportInfo,
	reportStatus,
	TERMINAL_JOB_STATUSES,
	uploadArtifact
} from "../runnerClient.ts";
import { redactKnownSecrets } from "../textRedaction.ts";

import { collectCredentialNames } from "./program/credentialNames.ts";
import { buildLocationIndex } from "./program/locationIndex.ts";

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
	| { type: "intervention" }
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

async function captureAndUploadArtifact(deps: LoopDeps, stepId: string): Promise<void> {
	try {
		const screenshot = await takeMaskedScreenshot(deps.page, deps.secrets);
		await uploadArtifact(deps.config, deps.job.comms.artifactsUrl, stepId, screenshot.toString("base64"));
	}
	catch (err: unknown) {
		// A failed artifact upload is not fatal to the Job's control flow — the transcript row
		// itself is the durable record; the screenshot is best-effort context.
		const rawMessage = err instanceof Error ? err.message : String(err);
		log(redactKnownSecrets(`job ${deps.job.id}: failed to capture/upload artifact for step ${stepId}: ${rawMessage}`, deps.secrets));
	}
}

// Drains every request the allowlist route handler blocked since the last drain, reporting each
// blocked subresource as its own INFO transcript row (non-fatal — the Step it happened during may
// still have succeeded; a later Step may fail because of it instead). A blocked *navigation* is
// reported by the caller as the Step's own outcome instead of an INFO row, since it always ends the
// Job — this only hands back that navigation's URL, if any, for the caller to act on.
async function reportBlockedRequests(deps: LoopDeps, stepId: string): Promise<string | undefined> {
	const events = deps.blockedEvents.splice(0, deps.blockedEvents.length);
	let navigationUrl: string | undefined;
	for (const event of events) {
		if (event.isNavigation) {
			navigationUrl ??= event.url;
			continue;
		}
		await reportInfo(deps.config, deps.job.id, redactKnownSecrets(`Step ${stepId}: blocked a disallowed-origin request to ${event.url}`, deps.secrets));
	}
	return navigationUrl;
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
		await reportBlockedRequests(deps, step.id);
		const rawMessage = err instanceof Error ? err.message : String(err);
		return { type: "error", message: redactKnownSecrets(`Unexpected error executing step ${step.id}: ${rawMessage}`, deps.secrets) };
	}

	// The route handler catches disallowed requests that hit the network stack before they're sent;
	// `isAllowedUrl(page.url(), ...)` is the backstop for navigations Playwright's interception can't
	// see at all (data:/about:/blob:), so both are checked here.
	const blockedNavigationUrl = await reportBlockedRequests(deps, step.id);
	if (blockedNavigationUrl !== undefined || !isAllowedUrl(deps.page.url(), [...deps.job.controls.allowedOrigins, ...SAFE_ALLOWED_ORIGINS])) {
		return { type: "error", message: redactKnownSecrets(`Step ${step.id} navigated to a disallowed origin: ${blockedNavigationUrl ?? deps.page.url()}`, deps.secrets) };
	}

	if (actionResult.kind === "businessFailure") {
		await reportChildOutcome(deps, step.id, "failed", parentStepId, []);
		return { type: "fail", error: actionResult.error! };
	}

	growSecretsFromExtraction(deps, recipe, actionResult);
	const extractions = toWireExtractions(actionResult);

	if (actionResult.outcome === "failed") {
		if (actionResult.error) {
			await reportInfo(deps.config, deps.job.id, redactKnownSecrets(`Step ${step.id} failed: ${actionResult.error.code}: ${actionResult.error.message}`, deps.secrets));
		}
		await reportChildOutcome(deps, step.id, "failed", parentStepId, extractions);
		if (!insideRecovery) {
			const recovered = await runRecoveryScan(deps, recipe);
			if (recovered) {
				return recovered.type === "ran" ? { type: "advance" } : recovered.outcome;
			}
		}
		return { type: "intervention" };
	}

	await reportChildOutcome(deps, step.id, "succeeded", parentStepId, extractions);

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

function scalarToWireValue(value: ScalarValue): string {
	return value === null ? "null" : String(value);
}

async function reportChildOutcome(deps: LoopDeps, stepId: string, outcome: "succeeded" | "failed", parentStepId: string | undefined, extractions: Array<{ fieldName: string; value: string }>): Promise<void> {
	await reportDslStep(deps.config, deps.job.id, {
		stepId,
		outcome,
		...(parentStepId !== undefined ? { parentStepId } : {}),
		extractions
	});
	await captureAndUploadArtifact(deps, stepId);
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
	if (outcome.type === "intervention") {
		// A recovery Step's own ordinary failure counts as the recovery itself failing, which
		// escalates straight to intervention rather than attempting a nested recovery.
		return { type: "outcome", outcome: { type: "intervention" } };
	}
	return { type: "outcome", outcome };
}

// The shared Automatic Loop interpreter: walks the Recipe's top-level Steps, descending into
// group/if children and reconstructing goto continuations, until a terminal SequenceOutcome
// (finish/fail/intervention/error) is reached.
async function runProgram(deps: LoopDeps, recipe: RecipeDefinition): Promise<SequenceOutcome> {
	const locationIndex = buildLocationIndex(recipe.steps);
	let pos: Position = { topIndex: 0 };

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
			pos = location.level === "top" ? { topIndex: location.topIndex } : { topIndex: location.topIndex, resume: { array: location.array, childIndex: location.childIndex } };
			continue;
		}
		return outcome;
	}
}

type InterventionResult = "timeout" | "terminal" | "unexpectedChange";

// Keeps the same browser/page open and polls Hub for an externally changed status until either
// the intervention timeout elapses or Hub reports a status this Runner didn't set itself. There is
// no human "take control" input to wait for yet, so only the timeout and external-change branches
// apply here.
async function waitForIntervention(deps: LoopDeps, interventionTimeoutSeconds: number): Promise<InterventionResult> {
	const deadline = Date.now() + interventionTimeoutSeconds * 1000;
	for (;;) {
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) {
			await reportStatus(deps.config, deps.job.id, JobStatus.CompletedFailed, "Intervention timed out with no human recovery");
			return "timeout";
		}
		await sleep(Math.min(RECOVERY_POLL_INTERVAL_MS, remainingMs));
		if (Date.now() >= deadline) {
			await reportStatus(deps.config, deps.job.id, JobStatus.CompletedFailed, "Intervention timed out with no human recovery");
			return "timeout";
		}
		const statusId = await fetchJobStatus(deps.config, deps.job.comms.statusUrl);
		if (statusId === JobStatus.InterventionRequested) {
			continue;
		}
		if (TERMINAL_JOB_STATUSES.includes(statusId)) {
			return "terminal";
		}
		await reportStatus(deps.config, deps.job.id, JobStatus.CompletedError, `Unexpected status change to ${statusId} during intervention`);
		return "unexpectedChange";
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
		resolveCredential
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
		const outcome = await runProgram(deps, job.recipe);

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
			await reportStatus(config, job.id, JobStatus.InterventionRequested, "A Step failed with no matching recoverable scenario");
			await waitForIntervention(deps, interventionTimeoutSeconds);
		}
	}
	catch (err: unknown) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		log(redactKnownSecrets(`job ${job.id}: recipe loop failed unexpectedly, abandoning back to polling: ${rawMessage}`, secrets));
	}
	finally {
		await captureAndUploadArtifact(deps, "terminal");
		await closeBrowserSession(session);
		log(`job ${job.id}: recipe loop finished, resuming polling`);
	}
}
