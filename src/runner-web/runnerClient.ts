import type { RecipeDefinition } from "./dsl/types.ts";
import type { RunnerConfig } from "./config.ts";

export interface InitResult {
	pollIntervalSeconds: number;
	interventionTimeoutSeconds: number;
}

// Mirrors src/hub/src/lib/server/storage/db/jobStatus.ts's hardcoded ids — kept in sync manually, same as
// the DSL type mirroring described in dsl/types.ts.
export enum JobStatus {
	Pending = 1,
	Running = 2,
	CompletedSuccess = 3,
	CompletedFailed = 4,
	CompletedCancelled = 5,
	InterventionRequested = 6,
	CompletedError = 7
}

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
	JobStatus.CompletedSuccess,
	JobStatus.CompletedFailed,
	JobStatus.CompletedCancelled,
	JobStatus.CompletedError
];

// Mirrors buildRecipeJobPayload's wire shape in src/hub/src/lib/server/runnerActions.ts.
export interface ClaimedRecipeJob {
	id: number;
	mode: string;
	recipeId: number;
	recipeVersion: number;
	recipe: RecipeDefinition;
	ingredients: Record<string, string | number | boolean>;
	controls: { allowedOrigins: string[] };
	stepTimeoutMs: number;
	comms: { statusUrl: string; artifactsUrl: string };
}

// A Recipe Job payload always carries a `recipe` field; Training's ClaimedJob never does — that's
// the wire discriminant Hub already uses server-side (job.jobType === JobType.Recipe).
export function isRecipeJob(job: ClaimedJob | ClaimedRecipeJob): job is ClaimedRecipeJob {
	return "recipe" in job;
}

// resultField/resultValue are always sent as a pair (see Hub's toWireStep in runnerActions.ts) —
// this type says so, rather than leaving callers to fall back on an unreachable default.
export type JobStep = { sequence: number; kind: string; text: string } & (
	| { resultField?: undefined; resultValue?: undefined }
	| { resultField: string; resultValue: string }
);

export interface ClaimedJob {
	id: number;
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	nextStep: JobStep;
}

export interface PollResult {
	hasWork: boolean;
	job?: ClaimedJob | ClaimedRecipeJob;
}

export interface ReportStepRequest {
	kind: "step";
	sequence: number;
	message: string;
	inputs: string[];
	outputs: Array<{ fieldName: string; value: string }>;
}

export interface ReportDslStepRequest {
	kind: "dslStep";
	stepId: string;
	outcome: "succeeded" | "failed";
	parentStepId?: string;
	extractions: Array<{ fieldName: string; value: string }>;
}

export interface ReportStatusRequest {
	kind: "status";
	status: JobStatus;
	message: string;
}

export interface ReportInfoRequest {
	kind: "info";
	message: string;
}

export interface ReportStepResult {
	jobStatusId: number;
	nextStep?: JobStep;
}

// Carries the HTTP status so callers can distinguish an ownership/unknown-job rejection
// (403/404 — abandon the job loop) from any other failure.
export class RunnerHttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export async function initRunner(config: RunnerConfig): Promise<InitResult> {
	const response = await fetch(`${config.hubUrl}/api/runner/runners/${config.runnerId}/init`, {
		method: "POST",
		headers: { authorization: `Bearer ${config.runnerSharedSecret}` }
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
		throw new Error(`init failed: ${response.status} ${body?.error ?? response.statusText}`);
	}

	const body = (await response.json()) as { data: InitResult };
	return body.data;
}

export async function pollRunner(config: RunnerConfig): Promise<PollResult> {
	const response = await fetch(`${config.hubUrl}/api/runner/runners/${config.runnerId}/poll`, {
		method: "POST",
		headers: { authorization: `Bearer ${config.runnerSharedSecret}` }
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
		throw new Error(`poll failed: ${response.status} ${body?.error ?? response.statusText}`);
	}

	const body = (await response.json()) as { data: PollResult };
	return body.data;
}

async function postJobStep(
	config: RunnerConfig,
	jobId: number,
	request: ReportStepRequest | ReportDslStepRequest | ReportStatusRequest | ReportInfoRequest
): Promise<ReportStepResult> {
	const response = await fetch(`${config.hubUrl}/api/runner/runners/${config.runnerId}/jobs/${jobId}/steps`, {
		method: "POST",
		headers: { authorization: `Bearer ${config.runnerSharedSecret}`, "content-type": "application/json" },
		body: JSON.stringify(request)
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
		throw new RunnerHttpError(response.status, `reportStep failed: ${response.status} ${body?.error ?? response.statusText}`);
	}

	const body = (await response.json()) as { data: ReportStepResult };
	return body.data;
}

export async function reportStep(config: RunnerConfig, jobId: number, request: ReportStepRequest): Promise<ReportStepResult> {
	return postJobStep(config, jobId, request);
}

// Reports one DSL Step's (or child Step's) outcome; extractions carry the raw resolved value to
// Hub's masked-upsert path by design (see runnerActions.ts's handleDslStepReport) — callers must
// never log those raw values themselves.
export async function reportDslStep(config: RunnerConfig, jobId: number, request: Omit<ReportDslStepRequest, "kind">): Promise<ReportStepResult> {
	return postJobStep(config, jobId, { kind: "dslStep", ...request });
}

// Directly changes a Job's status (e.g. Intervention-Requested, Completed-Error/-Failed/-Success)
// — the same "status" report kind Hub's reportJobStep already accepts.
export async function reportStatus(config: RunnerConfig, jobId: number, status: JobStatus, message: string): Promise<ReportStepResult> {
	return postJobStep(config, jobId, { kind: "status", status, message });
}

// A non-fatal transcript note — e.g. a blocked subresource request that didn't fail the current
// Step outright, but may explain why a later Step can't find what it's looking for.
export async function reportInfo(config: RunnerConfig, jobId: number, message: string): Promise<ReportStepResult> {
	return postJobStep(config, jobId, { kind: "info", message });
}

export async function uploadArtifact(config: RunnerConfig, artifactsUrl: string, stepId: string, imageBase64: string): Promise<{ id: number }> {
	const response = await fetch(`${config.hubUrl}${artifactsUrl}`, {
		method: "POST",
		headers: { authorization: `Bearer ${config.runnerSharedSecret}`, "content-type": "application/json" },
		body: JSON.stringify({ stepId, imageBase64 })
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
		throw new RunnerHttpError(response.status, `uploadArtifact failed: ${response.status} ${body?.error ?? response.statusText}`);
	}

	const body = (await response.json()) as { data: { id: number } };
	return body.data;
}

// Polls the Hub-side Job detail (no runner bearer-auth required, same endpoint the Hub UI uses)
// for its current status — used during the Intervention-Requested wait to detect an externally
// changed terminal status.
export async function fetchJobStatus(config: RunnerConfig, statusUrl: string): Promise<JobStatus> {
	const response = await fetch(`${config.hubUrl}${statusUrl}`);

	if (!response.ok) {
		const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
		throw new Error(`fetchJobStatus failed: ${response.status} ${body?.error ?? response.statusText}`);
	}

	const body = (await response.json()) as { data: { jobStatusId: JobStatus } };
	return body.data.jobStatusId;
}
