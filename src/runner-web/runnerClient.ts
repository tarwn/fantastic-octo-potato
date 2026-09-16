import type { RunnerConfig } from "./config.ts";

export interface InitResult {
	pollIntervalSeconds: number;
	interventionTimeoutSeconds: number;
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
	job?: ClaimedJob;
}

export interface ReportStepRequest {
	kind: "step";
	sequence: number;
	message: string;
	inputs: string[];
	outputs: Array<{ fieldName: string; value: string }>;
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

export async function reportStep(config: RunnerConfig, jobId: number, request: ReportStepRequest): Promise<ReportStepResult> {
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
