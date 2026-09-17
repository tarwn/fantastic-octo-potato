// Values mirror the explicit, hardcoded ids seeded for job_status in
// db/migrations/20260915234029_create_job_tables.sql — keep both in sync.
export enum JobStatus {
	Pending = 1,
	Running = 2,
	CompletedSuccess = 3,
	CompletedFailed = 4,
	CompletedCancelled = 5,
	InterventionRequested = 6,
	CompletedError = 7
}
