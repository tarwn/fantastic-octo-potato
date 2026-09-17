// Values mirror the explicit, hardcoded ids seeded for job_transcript_kind in
// db/migrations/20260916113338_restructure_job_tables.sql — keep both in sync.
export enum TranscriptKind {
	Status = 1,
	Info = 2,
	Step = 3,
	Recover = 4,
	Halt = 5,
	Observe = 6,
	Plan = 7
}
