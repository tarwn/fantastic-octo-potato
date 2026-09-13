import type { StatusVariant } from "$lib/components/statusVariants";

export interface JobStatus {
	variant: StatusVariant;
	label: string;
}

export type StageSegmentVariant = "done" | "attention" | "failed" | "remaining";

export interface StageSegment {
	variant: StageSegmentVariant;
	weight: number;
}

export interface JobStage {
	label: string;
	note: string;
	timing: string;
	segments: StageSegment[];
}

export type TranscriptRowKind = "status" | "step" | "recover" | "info" | "halt" | "plan" | "observe" | "terminal";

export interface TranscriptEntry {
	time: string;
	kind: TranscriptRowKind;
	text: string;
	redacted?: string;
	pii?: boolean;
	statusChange?: JobStatus;
	screenshot?: boolean;
}

export interface TranscriptDay {
	dateLabel: string;
	entries: TranscriptEntry[];
}

export interface ResultField {
	label: string;
	value: string;
	pending?: boolean;
	redacted?: boolean;
	sensitive?: boolean;
}

export interface JobStrip {
	customer: string;
	application: string;
	recipeVersion: string;
	recipeState: "released" | "draft";
	runner: string;
	runnerAddress: string;
	status: JobStatus;
}

export interface JobGoals {
	description: string;
	allowlist: string;
}

export interface Job {
	id: string;
	mode: "execute" | "training";
	eyebrow: string;
	title: string;
	strip: JobStrip;
	stage: JobStage;
	transcriptMeta: string;
	transcript: TranscriptDay[];
	resultsMeta: string;
	results: ResultField[];
	goals?: JobGoals;
	interventionMessage?: string;
}
