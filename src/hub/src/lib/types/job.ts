import type { JobStatus } from "$lib/jobStatus";
import type { TranscriptKind } from "$lib/jobTranscriptKind";
import type { JobType } from "$lib/jobType";
import type { SensitivityType } from "$lib/sensitivityType";

export interface TrainingJob {
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
}

export interface RecipeJob {
	recipeId: number | null;
}

interface JobBase {
	id: number;
	customerApplicationXrefId: number;
	jobStatusId: JobStatus;
	runnerId: number | null;
	createdAt: Date;
	startedAt: Date | null;
	heartbeatOn: Date | null;
	completedAt: Date | null;
}

export type Job =
	| (JobBase & { jobType: JobType.Training; details: TrainingJob })
	| (JobBase & { jobType: JobType.Recipe; details: RecipeJob });

export interface TranscriptFieldRef {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export interface StepTranscriptText {
	message: string;
	inputs: TranscriptFieldRef[];
	outputs: TranscriptFieldRef[];
}

interface JobTranscriptEntryBase {
	id: number;
	jobId: number;
	sequence: number;
	createdAt: Date;
	// Set only on a Status-kind entry — the Job's new status, captured in the same
	// moment the transcript row was written.
	jobStatusId: JobStatus | null;
}

export type JobTranscriptEntry =
	| (JobTranscriptEntryBase & { kind: TranscriptKind.Step; text: StepTranscriptText })
	| (JobTranscriptEntryBase & { kind: Exclude<TranscriptKind, TranscriptKind.Step>; text: string });

export interface SafeIngredient {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export interface JobResult {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export type JobDetail = Job & {
	transcript: JobTranscriptEntry[];
	results: JobResult[];
	ingredients: SafeIngredient[];
};
