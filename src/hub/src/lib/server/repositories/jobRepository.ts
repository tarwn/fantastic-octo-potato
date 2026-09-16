import type Database from "better-sqlite3";

import { fromDbDate, toDbDate } from "../db/dates.ts";
import { JobStatus } from "../db/jobStatus.ts";

export const TERMINAL_JOB_STATUSES = [JobStatus.CompletedSuccess, JobStatus.CompletedFailed, JobStatus.CompletedCancelled];

// Grows to include "trial"/"execute" once those modes exist; until then, only "training" is valid.
export const JOB_MODES = ["training"] as const;
export type JobMode = (typeof JOB_MODES)[number];

function assertValidJobMode(mode: string): asserts mode is JobMode {
	if (!(JOB_MODES as readonly string[]).includes(mode)) {
		throw new Error(`Invalid job mode: ${mode}`);
	}
}

export interface Job {
	id: number;
	customerApplicationXrefId: number;
	mode: JobMode;
	jobStatusId: JobStatus;
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	runnerId: number | null;
	createdAt: Date;
	startedAt: Date | null;
	heartbeatOn: Date | null;
	completedAt: Date | null;
}

export interface JobTranscriptEntry {
	id: number;
	jobId: number;
	sequence: number;
	kind: string;
	text: string;
	createdAt: Date;
}

export interface JobResult {
	id: number;
	jobId: number;
	fieldName: string;
	value: string;
	createdAt: Date;
}

interface JobRow {
	id: number;
	customerApplicationXrefId: number;
	mode: string;
	jobStatusId: number;
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	runnerId: number | null;
	createdAt: string;
	startedAt: string | null;
	heartbeatOn: string | null;
	completedAt: string | null;
}

interface JobTranscriptEntryRow {
	id: number;
	jobId: number;
	sequence: number;
	kind: string;
	text: string;
	createdAt: string;
}

interface JobResultRow {
	id: number;
	jobId: number;
	fieldName: string;
	value: string;
	createdAt: string;
}

const JOB_SELECT = `
	SELECT id, customer_application_xref_id AS customerApplicationXrefId, mode, job_status_id AS jobStatusId,
	       goal, starting_url AS startingUrl, allowlist, max_steps AS maxSteps, runner_id AS runnerId,
	       created_at AS createdAt, started_at AS startedAt, heartbeat_on AS heartbeatOn, completed_at AS completedAt
	FROM job
`;

function mapJobRow(row: JobRow): Job {
	assertValidJobMode(row.mode);
	return {
		...row,
		mode: row.mode,
		createdAt: fromDbDate(row.createdAt),
		startedAt: fromDbDate(row.startedAt),
		heartbeatOn: fromDbDate(row.heartbeatOn),
		completedAt: fromDbDate(row.completedAt)
	};
}

function mapTranscriptEntryRow(row: JobTranscriptEntryRow): JobTranscriptEntry {
	return { ...row, createdAt: fromDbDate(row.createdAt) };
}

function mapJobResultRow(row: JobResultRow): JobResult {
	return { ...row, createdAt: fromDbDate(row.createdAt) };
}

export interface InsertJobParams {
	customerApplicationXrefId: number;
	mode: JobMode;
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	createdAt: Date;
}

export function insertJob(db: Database.Database, params: InsertJobParams): Job {
	assertValidJobMode(params.mode);

	const { lastInsertRowid } = db
		.prepare(
			`INSERT INTO job (customer_application_xref_id, mode, job_status_id, goal, starting_url, allowlist, max_steps, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			params.customerApplicationXrefId,
			params.mode,
			JobStatus.Pending,
			params.goal,
			params.startingUrl,
			params.allowlist,
			params.maxSteps,
			toDbDate(params.createdAt)
		);
	return {
		id: Number(lastInsertRowid),
		customerApplicationXrefId: params.customerApplicationXrefId,
		mode: params.mode,
		jobStatusId: JobStatus.Pending,
		goal: params.goal,
		startingUrl: params.startingUrl,
		allowlist: params.allowlist,
		maxSteps: params.maxSteps,
		runnerId: null,
		createdAt: params.createdAt,
		startedAt: null,
		heartbeatOn: null,
		completedAt: null
	};
}

export function getJobById(db: Database.Database, id: number): Job | undefined {
	const row = db.prepare(`${JOB_SELECT} WHERE id = ?`).get(id) as JobRow | undefined;
	return row ? mapJobRow(row) : undefined;
}

export function listJobs(db: Database.Database): Job[] {
	const rows = db.prepare(`${JOB_SELECT} ORDER BY created_at DESC, id DESC`).all() as JobRow[];
	return rows.map(mapJobRow);
}

// Runs the find-and-claim as one transaction so two Runners racing for the same xref's oldest
// Pending Job can't both win it — the conditional UPDATE's affected-row count is the arbiter.
export function claimNextJobForRunner(
	db: Database.Database,
	customerApplicationXrefId: number,
	runnerId: number,
	now: Date
): Job | undefined {
	return db.transaction(() => {
		const candidate = db
			.prepare(`${JOB_SELECT} WHERE customer_application_xref_id = ? AND job_status_id = ? ORDER BY created_at, id LIMIT 1`)
			.get(customerApplicationXrefId, JobStatus.Pending) as JobRow | undefined;
		if (!candidate) {
			return undefined;
		}

		const nowStr = toDbDate(now);
		const { changes } = db
			.prepare("UPDATE job SET job_status_id = ?, runner_id = ?, started_at = ?, heartbeat_on = ? WHERE id = ? AND job_status_id = ?")
			.run(JobStatus.Running, runnerId, nowStr, nowStr, candidate.id, JobStatus.Pending);
		if (changes === 0) {
			return undefined;
		}

		return mapJobRow({ ...candidate, jobStatusId: JobStatus.Running, runnerId, startedAt: nowStr, heartbeatOn: nowStr });
	})();
}

// No-op (0 rows affected) if the Job is already in a terminal status — an ended Job's
// status/timestamp must not be overwritten by a late or mismatched call.
export function updateJobStatus(db: Database.Database, jobId: number, status: JobStatus, completedAt: Date | null = null): void {
	db.prepare(
		`UPDATE job SET job_status_id = ?, completed_at = ? WHERE id = ? AND job_status_id NOT IN (${TERMINAL_JOB_STATUSES.join(",")})`
	).run(status, toDbDate(completedAt), jobId);
}

export function updateJobHeartbeat(db: Database.Database, jobId: number, when: Date): void {
	db.prepare("UPDATE job SET heartbeat_on = ? WHERE id = ?").run(toDbDate(when), jobId);
}

// UNIQUE(job_id, sequence) plus INSERT OR IGNORE makes a repeated/late report a no-op,
// not a duplicate transcript row.
export function appendTranscriptEntry(
	db: Database.Database,
	jobId: number,
	sequence: number,
	kind: string,
	text: string,
	createdAt: Date
): void {
	db.prepare("INSERT OR IGNORE INTO job_transcript_entry (job_id, sequence, kind, text, created_at) VALUES (?, ?, ?, ?, ?)").run(
		jobId,
		sequence,
		kind,
		text,
		toDbDate(createdAt)
	);
}

export function listTranscriptEntries(db: Database.Database, jobId: number): JobTranscriptEntry[] {
	const rows = db
		.prepare(
			"SELECT id, job_id AS jobId, sequence, kind, text, created_at AS createdAt FROM job_transcript_entry WHERE job_id = ? ORDER BY sequence"
		)
		.all(jobId) as JobTranscriptEntryRow[];
	return rows.map(mapTranscriptEntryRow);
}

// UNIQUE(job_id, field_name) plus the upsert makes the latest write win.
export function upsertJobResult(db: Database.Database, jobId: number, fieldName: string, value: string, createdAt: Date): void {
	db.prepare(
		`INSERT INTO job_result (job_id, field_name, value, created_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT (job_id, field_name) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`
	).run(jobId, fieldName, value, toDbDate(createdAt));
}

export function listJobResults(db: Database.Database, jobId: number): JobResult[] {
	const rows = db
		.prepare("SELECT id, job_id AS jobId, field_name AS fieldName, value, created_at AS createdAt FROM job_result WHERE job_id = ? ORDER BY field_name")
		.all(jobId) as JobResultRow[];
	return rows.map(mapJobResultRow);
}
