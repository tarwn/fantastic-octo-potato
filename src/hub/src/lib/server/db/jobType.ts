// Values mirror the explicit, hardcoded ids seeded for job_type in
// db/migrations/20260916113338_restructure_job_tables.sql — keep both in sync.
export enum JobType {
	Training = 1,
	Recipe = 2
}
