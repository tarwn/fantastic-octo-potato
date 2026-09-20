import { JobStatus } from "../storage/db/jobStatus";

export interface JobActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// halt is deliberately excluded — it's a schema/enum slot for a future Intervention-Requested
// status change, not something a Runner can submit as free text this spec.
export type ReportStepBody =
	| { kind: "status"; status: JobStatus; message: string }
	| { kind: "info"; message: string }
	// Both Recipe and Training Run Jobs report DSL Steps by string id (Training issues real atomic
	// DSL Steps, not a bespoke sequence-based shape). extractions still carries the raw
	// value on the wire (upsertJobResult needs it to compute a safe value) — it's the transcript
	// row built from this that only ever keeps the destination field name. credentialNames is
	// Training-only and names only, never values — the Runner's only chance to tell Hub what
	// `{ref:"credential"}` names its own RUNNER_CREDENTIAL_* env vars make available, since Hub has
	// no other way to learn them ahead of a next-Step prompt.
	| {
			kind: "dslStep";
			stepId: string;
			outcome: "succeeded" | "failed";
			parentStepId?: string;
			extractions: Array<{ fieldName: string; value: string }>;
			credentialNames?: string[];
	  }
	| { kind: "recover"; message: string }
	| { kind: "observe"; message: string }
	| { kind: "plan"; message: string };

export type ParseResult = { ok: true; value: ReportStepBody } | { ok: false; error: string };

const JOB_STATUS_VALUES = Object.values(JobStatus).filter((value): value is JobStatus => typeof value === "number");

export function isJobStatus(value: unknown): value is JobStatus {
	return typeof value === "number" && JOB_STATUS_VALUES.includes(value as JobStatus);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
