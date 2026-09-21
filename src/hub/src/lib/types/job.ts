import type { JobStatus } from "$lib/jobStatus";
import type { TranscriptKind } from "$lib/jobTranscriptKind";
import type { JobType } from "$lib/jobType";
import type { SensitivityType } from "$lib/sensitivityType";
import type { RecipeDefinition, Step } from "$lib/types/recipeDefinition";

export interface TrainingRunJob {
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	alternateGoals: string[];
	syntheticDataConfirmed: boolean;
	stepTimeoutMs: number;
}

export interface RecipeJob {
	recipeId: number | null;
	mode: "Trial" | "Execute";
	allowlist: string;
	stepTimeoutMs: number;
}

interface JobBase {
	name: string;
	id: number;
	customerApplicationXrefId: number;
	jobStatusId: JobStatus;
	runnerId: number | null;
	createdAt: Date;
	startedAt: Date | null;
	heartbeatOn: Date | null;
	completedAt: Date | null;
	interventionOwner: string | null;
	blockedStepId: string | null;
	blockedReason: string | null;
	resumeStepId: string | null;
}

export type Job =
	| (JobBase & { jobType: JobType.TrainingRun; details: TrainingRunJob })
	| (JobBase & { jobType: JobType.Recipe; details: RecipeJob });

export interface TranscriptFieldRef {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export interface StepTargetDescription {
	component: string;
	selector: string;
}

export interface StepTranscriptText {
	stepId: string;
	outcome: "succeeded" | "failed";
	action: string;
	parentStepId?: string;
	targetDescription: StepTargetDescription;
	inputs: TranscriptFieldRef[];
	outputs: TranscriptFieldRef[];
	error?: string;
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

export interface JobStepArtifact {
	id: number;
	stepId: string;
	createdAt: Date;
}

export type JobDetail = Job & {
	transcript: JobTranscriptEntry[];
	results: JobResult[];
	ingredients: SafeIngredient[];
	artifacts: JobStepArtifact[];
} & (
		| { jobType: JobType.TrainingRun; steps: Step[] }
		| { jobType: JobType.Recipe; recipe: RecipeDefinition }
	);
