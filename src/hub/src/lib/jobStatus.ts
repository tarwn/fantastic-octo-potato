import type { StatusVariant } from "./components/statusVariants";

// Values mirror the explicit, hardcoded ids seeded for job_status in
// db/migrations/20260915234029_create_job_tables.sql — keep both in sync.
// Client-safe copy of $lib/server/db/jobStatus.ts's JobStatus enum, since
// server modules can't be imported from client-visible code.
export enum JobStatus {
	Pending = 1,
	Running = 2,
	CompletedSuccess = 3,
	CompletedFailed = 4,
	CompletedCancelled = 5
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
	[JobStatus.Pending]: "Pending",
	[JobStatus.Running]: "Running",
	[JobStatus.CompletedSuccess]: "Completed-Success",
	[JobStatus.CompletedFailed]: "Completed-Failed",
	[JobStatus.CompletedCancelled]: "Completed-Cancelled"
};

export const JOB_STATUS_VARIANTS: Record<JobStatus, StatusVariant> = {
	[JobStatus.Pending]: "pending",
	[JobStatus.Running]: "running",
	[JobStatus.CompletedSuccess]: "success",
	[JobStatus.CompletedFailed]: "failed",
	[JobStatus.CompletedCancelled]: "cancelled"
};

const TERMINAL_JOB_STATUSES = [JobStatus.CompletedSuccess, JobStatus.CompletedFailed, JobStatus.CompletedCancelled];

export function isTerminalJobStatus(status: JobStatus): boolean {
	return TERMINAL_JOB_STATUSES.includes(status);
}
