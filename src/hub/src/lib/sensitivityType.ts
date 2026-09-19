// Values mirror the explicit, hardcoded ids seeded for sensitivity_type in
// db/migrations/20260916113338_restructure_job_tables.sql — keep both in sync.
// Client-safe copy of $lib/server/storage/db/sensitivityType.ts's SensitivityType enum, since
// server modules can't be imported from client-visible code.
export enum SensitivityType {
	None = 1,
	PII = 2,
	Other = 3
}
