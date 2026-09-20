// Values mirror the explicit, hardcoded ids seeded for job_type in
// db/migrations/20260916113338_restructure_job_tables.sql — keep both in sync.
// Client-safe copy of $lib/server/storage/db/jobType.ts's JobType enum, since
// server modules can't be imported from client-visible code.
export enum JobType {
	TrainingRun = 1,
	Recipe = 2
}

export const JOB_TYPE_LABELS: Record<JobType, string> = {
	[JobType.TrainingRun]: "Training",
	[JobType.Recipe]: "Recipe"
};

export function jobTypeLabel(
	job: { jobType: JobType.TrainingRun } | { jobType: JobType.Recipe; details: { mode: "Trial" | "Execute" } }
): string {
	return job.jobType === JobType.Recipe ? job.details.mode : "Training Run";
}
