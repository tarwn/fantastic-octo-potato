import type { Page } from "playwright";

import { type BlockedRequestEvent, createAllowListRouteHandler, isAllowedUrl, SAFE_ALLOWED_ORIGINS } from "../allowList.ts";
import { type ActionOutcome, executeAction } from "../browser/actions.ts";
import { closeBrowserSession, launchBrowserSession } from "../browser/browserSession.ts";
import type { RunnerConfig } from "../config.ts";
import { listAvailableCredentialNames, resolveCredential } from "../credentials.ts";
import type { ExecutionContext } from "../dsl/executionContext.ts";
import { createOutputsState } from "../dsl/outputsState.ts";
import type { ChildStep } from "../dsl/types.ts";
import { log } from "../logger.ts";
import { type ClaimedJob, JobStatus, reportDslStep, reportInfo, reportStatus } from "../runnerClient.ts";
import { redactKnownSecrets } from "../textRedaction.ts";

import { captureAndUploadArtifact, reportBlockedRequests, scalarToWireValue, type StepReportingDeps } from "./stepReporting.ts";

// Training has no upfront Recipe to scan for declared-sensitive inputs (ClaimedRecipeJob's
// collectSecretValues does that) — a Job's sensitive Ingredient values (Step 3's Goal→Ingredients)
// plus every credential value this Runner happens to have locally are the whole known-secrets set.
function collectTrainingSecrets(job: ClaimedJob, credentialNames: string[]): string[] {
	const fromIngredients = job.sensitiveIngredientNames.map((name) => job.ingredients[name]).filter((value): value is string => value !== undefined);
	const fromCredentials = credentialNames.map((name) => resolveCredential(name));
	return [...fromIngredients, ...fromCredentials].filter((value) => value.trim() !== "");
}

interface LoopDeps {
	config: RunnerConfig;
	job: ClaimedJob;
	ctx: ExecutionContext;
	page: Page;
	secrets: string[];
	credentialNames: string[];
	blockedEvents: BlockedRequestEvent[];
}

// Adapts a Training loop's LoopDeps to the shape stepReporting.ts's shared helpers need — mirrors
// automaticLoop.ts's own adapter of the same name, since both carry a Job plus the same
// config/page/secrets/blockedEvents. Training has no `job.comms.artifactsUrl` (Hub sends no `comms`
// for it) — the artifact-upload endpoint is the same one Recipe uses, computed here from
// config.runnerId/job.id instead.
function stepReportingDeps(deps: LoopDeps): StepReportingDeps {
	return {
		config: deps.config,
		jobId: deps.job.id,
		artifactsUrl: `/api/runner/runners/${deps.config.runnerId}/jobs/${deps.job.id}/artifacts`,
		page: deps.page,
		secrets: deps.secrets,
		blockedEvents: deps.blockedEvents
	};
}

// Runs one atomic Step, reports its outcome (+ known credential names + masked screenshot), and
// hands back whatever Hub decides comes next — a further Step to execute, or `undefined` once Hub
// has decided the Job is terminal (Training is Hub-authoritative for progression, unlike Recipe's
// Automatic Loop — see recipe-automatic-loop.md). Any allowlist violation or unexpected technical
// error reports Completed-Error directly, mirroring automaticLoop.ts's terminal outcome mapping,
// since that's a Runner-side security/robustness decision, not one Training defers to Hub.
async function runOneStep(deps: LoopDeps, step: ChildStep): Promise<ChildStep | undefined> {
	let actionResult: ActionOutcome;
	try {
		actionResult = await executeAction(deps.page, step, deps.ctx);
	}
	catch (err: unknown) {
		await reportBlockedRequests(stepReportingDeps(deps), step.id);
		const rawMessage = err instanceof Error ? err.message : String(err);
		await reportStatus(deps.config, deps.job.id, JobStatus.CompletedError, redactKnownSecrets(`Unexpected error executing step ${step.id}: ${rawMessage}`, deps.secrets));
		return undefined;
	}

	const blockedNavigationUrl = await reportBlockedRequests(stepReportingDeps(deps), step.id);
	if (blockedNavigationUrl !== undefined || !isAllowedUrl(deps.page.url(), [deps.job.allowlist, ...SAFE_ALLOWED_ORIGINS])) {
		await reportDslStep(deps.config, deps.job.id, {
			stepId: step.id,
			outcome: "failed",
			extractions: [],
			targetDescription: actionResult.targetDescription,
			credentialNames: deps.credentialNames
		});
		await reportStatus(
			deps.config,
			deps.job.id,
			JobStatus.CompletedError,
			redactKnownSecrets(`Step ${step.id} navigated to a disallowed origin: ${blockedNavigationUrl ?? deps.page.url()}`, deps.secrets)
		);
		return undefined;
	}

	if (actionResult.outcome === "failed" && actionResult.error) {
		await reportInfo(deps.config, deps.job.id, redactKnownSecrets(`Step ${step.id} failed: ${actionResult.error.code}: ${actionResult.error.message}`, deps.secrets));
	}

	const extractions = actionResult.extraction ? [{ fieldName: actionResult.extraction.fieldName, value: scalarToWireValue(actionResult.extraction.value) }] : [];

	const result = await reportDslStep(deps.config, deps.job.id, {
		stepId: step.id,
		outcome: actionResult.outcome,
		extractions,
		targetDescription: actionResult.targetDescription,
		credentialNames: deps.credentialNames
	});
	await captureAndUploadArtifact(stepReportingDeps(deps), step.id, deps.job.syntheticDataConfirmed);

	return result.nextStep;
}

// Runs a Training Run Job end to end: execute the Hub-issued Step, report its outcome, receive the
// next Step (or nothing, once Hub decides the Job is terminal) in the same call, repeat — cleaning
// up the browser session on every exit path before returning control to the poll loop.
export async function runTrainingJobLoop(config: RunnerConfig, job: ClaimedJob): Promise<void> {
	const blockedEvents: BlockedRequestEvent[] = [];
	const routeHandler = createAllowListRouteHandler([job.allowlist, ...SAFE_ALLOWED_ORIGINS], (event) => blockedEvents.push(event));
	const credentialNames = listAvailableCredentialNames();
	const secrets = collectTrainingSecrets(job, credentialNames);

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
	const deps: LoopDeps = { config, job, ctx, page: session.page, secrets, credentialNames, blockedEvents };

	try {
		let step: ChildStep | undefined = job.nextStep;
		while (step) {
			step = await runOneStep(deps, step);
		}
	}
	catch (err: unknown) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		log(redactKnownSecrets(`job ${job.id}: training loop failed unexpectedly, abandoning back to polling: ${rawMessage}`, secrets));
	}
	finally {
		await captureAndUploadArtifact(stepReportingDeps(deps), "terminal", job.syntheticDataConfirmed);
		await closeBrowserSession(session);
		log(`job ${job.id}: training loop finished, resuming polling`);
	}
}
