import type { Page } from "playwright";

import { type ActionOutcome, executeAction } from "../browser/actions.ts";
import { closeBrowserSession, launchBrowserSession } from "../browser/browserSession.ts";
import { evaluateCondition } from "../browser/conditions.ts";
import { takeMaskedScreenshot } from "../browser/screenshotMasking.ts";
import type { RunnerConfig } from "../config.ts";
import { resolveCredential } from "../credentials.ts";
import type { ExecutionContext } from "../dsl/executionContext.ts";
import { createOutputsState } from "../dsl/outputsState.ts";
import type { ChildStep, RecipeDefinition, Recovery, ScalarValue, Step } from "../dsl/types.ts";
import { log } from "../logger.ts";
import {
	type ClaimedRecipeJob,
	fetchJobStatus,
	JobStatus,
	reportDslStep,
	reportStatus,
	TERMINAL_JOB_STATUSES,
	uploadArtifact
} from "../runnerClient.ts";

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

type Location =
	| { level: "top"; topIndex: number }
	| { level: "child"; topIndex: number; array: ChildStep[]; childIndex: number };

// Indexes every Step id (top-level and one level of group/if children) to where it lives, so
// `goto` can jump anywhere and reconstruct the right continuation without re-evaluating an
// enclosing `if`'s guard.
function buildLocationIndex(steps: Step[]): Map<string, Location> {
	const index = new Map<string, Location>();
	steps.forEach((step, topIndex) => {
		index.set(step.id, { level: "top", topIndex });
		if (step.action === "group") {
			const children = step.args[0];
			children.forEach((child, childIndex) => index.set(child.id, { level: "child", topIndex, array: children, childIndex }));
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			for (const ifCase of cases) {
				ifCase.steps.forEach((child, childIndex) => index.set(child.id, { level: "child", topIndex, array: ifCase.steps, childIndex }));
			}
			elseSteps.forEach((child, childIndex) => index.set(child.id, { level: "child", topIndex, array: elseSteps, childIndex }));
		}
	});
	return index;
}

interface Position {
	topIndex: number;
	resume?: { array: ChildStep[]; childIndex: number };
}

function isValueRef(value: unknown): value is { ref: string; name: string } {
	return typeof value === "object" && value !== null && "ref" in value;
}

// Walks the whole program (including recoveries) for every `{ref:"credential"}` reference, so
// their resolved values can be masked out of screenshots even though nothing on the wire ever
// tells the Runner which credential names a Recipe uses ahead of time.
function collectCredentialNames(recipe: RecipeDefinition): Set<string> {
	const names = new Set<string>();
	function visitValue(value: unknown): void {
		if (isValueRef(value) && value.ref === "credential") {
			names.add(value.name);
		}
	}
	function visitChild(step: ChildStep): void {
		switch (step.action) {
			case "open":
				visitValue(step.args[0]);
				break;
			case "fill":
				visitValue(step.args[1]);
				break;
			case "select":
				for (const option of step.args[1]) {
					visitValue(option.value);
				}
				break;
			case "assign":
				visitValue(step.args[1]);
				break;
			default:
				break;
		}
	}
	function visitChildren(children: ChildStep[]): void {
		for (const child of children) {
			visitChild(child);
		}
	}
	for (const step of recipe.steps) {
		if (step.action === "group") {
			visitChildren(step.args[0]);
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			for (const ifCase of cases) {
				visitChildren(ifCase.steps);
			}
			visitChildren(elseSteps);
		}
		else {
			visitChild(step);
		}
	}
	for (const recovery of recipe.recoveries) {
		visitChildren(recovery.steps);
	}
	return names;
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

const SCHEME_ONLY_PATTERN = /^[a-z][a-z0-9+.-]*:$/i;

// Compares by parsed origin, not raw string prefix — a plain prefix match would also let
// "https://example.com.attacker.com" or "https://example.com@attacker.com" through for an
// allowlist entry of "https://example.com". A bare scheme entry (e.g. "data:") is a special case
// for opaque-origin schemes that have no real origin to compare, matched by scheme instead.
function isAllowedUrl(url: string, allowedOrigins: string[]): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	}
	catch {
		return false;
	}
	return allowedOrigins.some((allowed) => {
		if (SCHEME_ONLY_PATTERN.test(allowed)) {
			return parsed.protocol === allowed;
		}
		try {
			return parsed.origin === new URL(allowed).origin;
		}
		catch {
			return false;
		}
	});
}

interface LoopDeps {
	config: RunnerConfig;
	job: ClaimedRecipeJob;
	ctx: ExecutionContext;
	page: Page;
	secrets: string[];
	recoveryAttempts: Map<string, number>;
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
		log(`job ${deps.job.id}: failed to capture/upload artifact for step ${stepId}: ${err instanceof Error ? err.message : String(err)}`);
	}
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
		return { type: "error", message: `Unexpected error executing step ${step.id}: ${err instanceof Error ? err.message : String(err)}` };
	}

	if (!isAllowedUrl(deps.page.url(), deps.job.controls.allowedOrigins)) {
		return { type: "error", message: `Step ${step.id} navigated to a disallowed origin: ${deps.page.url()}` };
	}

	if (actionResult.kind === "businessFailure") {
		await reportChildOutcome(deps, step.id, "failed", parentStepId, []);
		return { type: "fail", error: actionResult.error! };
	}

	const extractions = toWireExtractions(actionResult);

	if (actionResult.outcome === "failed") {
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
	let session;
	try {
		session = await launchBrowserSession();
	}
	catch (err: unknown) {
		log(`job ${job.id}: failed to launch a browser session, abandoning back to polling: ${err instanceof Error ? err.message : String(err)}`);
		await reportStatus(config, job.id, JobStatus.CompletedError, `Failed to launch a browser session: ${err instanceof Error ? err.message : String(err)}`).catch(() => undefined);
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
		secrets: collectSecretValues(job.recipe, job.ingredients, resolveCredential),
		recoveryAttempts: new Map()
	};

	try {
		const outcome = await runProgram(deps, job.recipe);

		if (outcome.type === "error") {
			await reportStatus(config, job.id, JobStatus.CompletedError, outcome.message);
		}
		else if (outcome.type === "fail") {
			await reportStatus(config, job.id, JobStatus.CompletedFailed, `${outcome.error.code}: ${outcome.error.message}`);
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
		log(`job ${job.id}: recipe loop failed unexpectedly, abandoning back to polling: ${err instanceof Error ? err.message : String(err)}`);
	}
	finally {
		await captureAndUploadArtifact(deps, "terminal");
		await closeBrowserSession(session);
		log(`job ${job.id}: recipe loop finished, resuming polling`);
	}
}
