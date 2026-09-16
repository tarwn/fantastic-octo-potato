import type Database from "better-sqlite3";

import { fromDbDate, toDbDate } from "../db/dates.ts";
import { JobStatus } from "../db/jobStatus.ts";
import { TranscriptKind } from "../db/jobTranscriptKind.ts";
import { JobType } from "../db/jobType.ts";
import { SensitivityType } from "../db/sensitivityType.ts";

export const TERMINAL_JOB_STATUSES = [JobStatus.CompletedSuccess, JobStatus.CompletedFailed, JobStatus.CompletedCancelled];

// Status-change transcript rows share job_transcript_entry's (job_id, sequence) column with
// step reports, so they're pinned outside a step report's 1..maxSteps range: negative before
// any step runs, maxSteps+1 (guaranteed unused — reportJobStep never reports past maxSteps)
// once the Job reaches a terminal status.
export const JOB_CREATED_SEQUENCE = -2;
export const JOB_CLAIMED_SEQUENCE = -1;

export function terminalTranscriptSequence(maxSteps: number): number {
	return maxSteps + 1;
}

// A Runner-submitted non-Step kind (status/info/recover/observe/plan) carries no sequence of
// its own — Hub assigns the next one after whatever positive (in-scripted-flow) sequence
// already exists, leaving the negative/terminal sentinel sequences (JOB_CREATED_SEQUENCE et al.) alone.
function nextTranscriptSequence(db: Database.Database, jobId: number): number {
	const row = db
		.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM job_transcript_entry WHERE job_id = ? AND sequence > 0")
		.get(jobId) as { next: number };
	return row.next;
}

// Fixed masking token, not real PII/secret detection — a placeholder until real Runner/Hub masking lands.
const MASK_TOKEN = "••••••";

// Exported so a caller that must build a masked TranscriptFieldRef in the same turn as a write
// (e.g. a Step submission's outputs) can derive it without a second read — masking still only
// ever happens through this one function.
export function maskValue(rawValue: string, sensitivityType: SensitivityType): string {
	return sensitivityType === SensitivityType.None ? rawValue : MASK_TOKEN;
}

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

export type InsertJobParams =
	| {
			jobType: JobType.Training;
			customerApplicationXrefId: number;
			goal: string;
			startingUrl: string;
			allowlist: string;
			maxSteps: number;
			createdAt: Date;
	  }
	| {
			jobType: JobType.Recipe;
			customerApplicationXrefId: number;
			recipeId: number | null;
			createdAt: Date;
	  };

export interface TranscriptFieldRef {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

interface StepTranscriptText {
	message: string;
	inputs: TranscriptFieldRef[];
	outputs: TranscriptFieldRef[];
}

interface TranscriptEntryBase {
	id: number;
	jobId: number;
	sequence: number;
	createdAt: Date;
	// Set only on a Status-kind entry — the Job's new status, captured in the same
	// INSERT as the message, at the same moment its job.job_status_id was updated.
	jobStatusId: JobStatus | null;
}

export type JobTranscriptEntry =
	| (TranscriptEntryBase & { kind: TranscriptKind.Step; text: StepTranscriptText })
	| (TranscriptEntryBase & { kind: Exclude<TranscriptKind, TranscriptKind.Step>; text: string });

export interface SafeIngredient {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export type SensitiveIngredient = SafeIngredient & { rawValue: string };

export interface SafeResult {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export type SensitiveResult = SafeResult & { rawValue: string };

interface JobRow {
	id: number;
	customerApplicationXrefId: number;
	jobTypeId: number;
	jobStatusId: number;
	runnerId: number | null;
	createdAt: string;
	startedAt: string | null;
	heartbeatOn: string | null;
	completedAt: string | null;
	trainingGoal: string | null;
	trainingStartingUrl: string | null;
	trainingAllowlist: string | null;
	trainingMaxSteps: number | null;
	recipeId: number | null;
	recipeJobId: number | null;
}

interface JobTranscriptEntryRow {
	id: number;
	jobId: number;
	sequence: number;
	jobTranscriptKindId: number;
	text: string;
	createdAt: string;
	jobStatusId: number | null;
}

interface JobIngredientRow {
	fieldName: string;
	rawValue: string;
	safeValue: string;
	sensitivityTypeId: number;
}

interface JobResultRow {
	fieldName: string;
	rawValue: string;
	safeValue: string;
	sensitivityTypeId: number;
}

const JOB_SELECT = `
	SELECT job.id, job.customer_application_xref_id AS customerApplicationXrefId, job.job_type_id AS jobTypeId,
	       job.job_status_id AS jobStatusId, job.runner_id AS runnerId, job.created_at AS createdAt,
	       job.started_at AS startedAt, job.heartbeat_on AS heartbeatOn, job.completed_at AS completedAt,
	       training_job.goal AS trainingGoal, training_job.starting_url AS trainingStartingUrl,
	       training_job.allowlist AS trainingAllowlist, training_job.max_steps AS trainingMaxSteps,
	       recipe_job.recipe_id AS recipeId, recipe_job.job_id AS recipeJobId
	FROM job
	LEFT JOIN training_job ON training_job.job_id = job.id
	LEFT JOIN recipe_job ON recipe_job.job_id = job.id
`;

function mapJobRow(row: JobRow): Job {
	const base: JobBase = {
		id: row.id,
		customerApplicationXrefId: row.customerApplicationXrefId,
		jobStatusId: row.jobStatusId,
		runnerId: row.runnerId,
		createdAt: fromDbDate(row.createdAt),
		startedAt: fromDbDate(row.startedAt),
		heartbeatOn: fromDbDate(row.heartbeatOn),
		completedAt: fromDbDate(row.completedAt)
	};

	if (row.jobTypeId === JobType.Training) {
		if (row.trainingGoal === null || row.trainingStartingUrl === null || row.trainingAllowlist === null || row.trainingMaxSteps === null) {
			throw new Error(`Job ${row.id} is job_type Training but has no training_job row`);
		}
		return {
			...base,
			jobType: JobType.Training,
			details: {
				goal: row.trainingGoal,
				startingUrl: row.trainingStartingUrl,
				allowlist: row.trainingAllowlist,
				maxSteps: row.trainingMaxSteps
			}
		};
	}

	if (row.jobTypeId === JobType.Recipe) {
		if (row.recipeJobId === null) {
			throw new Error(`Job ${row.id} is job_type Recipe but has no recipe_job row`);
		}
		return { ...base, jobType: JobType.Recipe, details: { recipeId: row.recipeId } };
	}

	throw new Error(`Invalid job type: ${row.jobTypeId}`);
}

function mapTranscriptEntryRow(row: JobTranscriptEntryRow): JobTranscriptEntry {
	const base = {
		id: row.id,
		jobId: row.jobId,
		sequence: row.sequence,
		createdAt: fromDbDate(row.createdAt),
		jobStatusId: row.jobStatusId
	};

	if (row.jobTranscriptKindId === TranscriptKind.Step) {
		return { ...base, kind: TranscriptKind.Step, text: JSON.parse(row.text) as StepTranscriptText };
	}
	return { ...base, kind: row.jobTranscriptKindId as Exclude<TranscriptKind, TranscriptKind.Step>, text: row.text };
}

function mapSafeIngredientRow(row: JobIngredientRow): SafeIngredient {
	return { fieldName: row.fieldName, safeValue: row.safeValue, sensitivityType: row.sensitivityTypeId };
}

function mapSensitiveIngredientRow(row: JobIngredientRow): SensitiveIngredient {
	return { ...mapSafeIngredientRow(row), rawValue: row.rawValue };
}

function mapSafeResultRow(row: JobResultRow): SafeResult {
	return { fieldName: row.fieldName, safeValue: row.safeValue, sensitivityType: row.sensitivityTypeId };
}

function mapSensitiveResultRow(row: JobResultRow): SensitiveResult {
	return { ...mapSafeResultRow(row), rawValue: row.rawValue };
}

export function insertJob(db: Database.Database, params: InsertJobParams): Job {
	return db.transaction((): Job => {
		const { lastInsertRowid } = db
			.prepare("INSERT INTO job (customer_application_xref_id, job_type_id, job_status_id, created_at) VALUES (?, ?, ?, ?)")
			.run(params.customerApplicationXrefId, params.jobType, JobStatus.Pending, toDbDate(params.createdAt));
		const jobId = Number(lastInsertRowid);

		const base: JobBase = {
			id: jobId,
			customerApplicationXrefId: params.customerApplicationXrefId,
			jobStatusId: JobStatus.Pending,
			runnerId: null,
			createdAt: params.createdAt,
			startedAt: null,
			heartbeatOn: null,
			completedAt: null
		};

		if (params.jobType === JobType.Training) {
			db.prepare("INSERT INTO training_job (job_id, goal, starting_url, allowlist, max_steps) VALUES (?, ?, ?, ?, ?)").run(
				jobId,
				params.goal,
				params.startingUrl,
				params.allowlist,
				params.maxSteps
			);
			return {
				...base,
				jobType: JobType.Training,
				details: { goal: params.goal, startingUrl: params.startingUrl, allowlist: params.allowlist, maxSteps: params.maxSteps }
			};
		}

		db.prepare("INSERT INTO recipe_job (job_id, recipe_id) VALUES (?, ?)").run(jobId, params.recipeId);
		return { ...base, jobType: JobType.Recipe, details: { recipeId: params.recipeId } };
	})();
}

export function getJobById(db: Database.Database, id: number): Job | undefined {
	const row = db.prepare(`${JOB_SELECT} WHERE job.id = ?`).get(id) as JobRow | undefined;
	return row ? mapJobRow(row) : undefined;
}

export function listJobs(db: Database.Database): Job[] {
	const rows = db.prepare(`${JOB_SELECT} ORDER BY job.created_at DESC, job.id DESC`).all() as JobRow[];
	return rows.map(mapJobRow);
}

// Batched so RunnersPanel can resolve every listed Runner's current Job in one query instead of one per Runner.
export function listRunningJobIdsByRunnerId(db: Database.Database, runnerIds: number[]): Map<number, number> {
	if (runnerIds.length === 0) {
		return new Map();
	}

	const placeholders = runnerIds.map(() => "?").join(",");
	const rows = db
		.prepare(`SELECT id, runner_id AS runnerId FROM job WHERE job_status_id = ? AND runner_id IN (${placeholders})`)
		.all(JobStatus.Running, ...runnerIds) as { id: number; runnerId: number }[];
	return new Map(rows.map((row) => [row.runnerId, row.id]));
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
			.prepare(`${JOB_SELECT} WHERE job.customer_application_xref_id = ? AND job.job_status_id = ? ORDER BY job.created_at, job.id LIMIT 1`)
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

// UNIQUE(job_id, sequence) plus INSERT OR IGNORE makes a repeated/late report a no-op, not a
// duplicate transcript row. jobStatusId is set only for a Status-kind entry — callers pass the
// Job's new status in the same INSERT as the row that announces it. JSON serialization of a
// Step's structured text happens only here — no other code JSON-stringifies this column.
export function appendTranscriptEntry(
	db: Database.Database,
	jobId: number,
	sequence: number,
	kind: Exclude<TranscriptKind, TranscriptKind.Step>,
	message: string,
	createdAt: Date,
	jobStatusId?: JobStatus | null
): void;
export function appendTranscriptEntry(
	db: Database.Database,
	jobId: number,
	sequence: number,
	kind: TranscriptKind.Step,
	details: StepTranscriptText,
	createdAt: Date
): void;
export function appendTranscriptEntry(
	db: Database.Database,
	jobId: number,
	sequence: number,
	kind: TranscriptKind,
	messageOrDetails: string | StepTranscriptText,
	createdAt: Date,
	jobStatusId: JobStatus | null = null
): void {
	const text = kind === TranscriptKind.Step ? JSON.stringify(messageOrDetails) : (messageOrDetails as string);
	db.prepare(
		"INSERT OR IGNORE INTO job_transcript_entry (job_id, sequence, job_transcript_kind_id, text, created_at, job_status_id) VALUES (?, ?, ?, ?, ?, ?)"
	).run(jobId, sequence, kind, text, toDbDate(createdAt), jobStatusId);
}

// Wraps the auto-assigned-sequence lookup, the transcript insert, and (when a status change
// accompanies the entry) the job_status update in one transaction — mirrors claimNextJobForRunner's
// find-then-claim pattern so two concurrent non-Step submissions can't silently lose a transcript
// row to the UNIQUE(job_id, sequence) constraint's INSERT OR IGNORE.
export function appendAutoSequencedTranscriptEntry(
	db: Database.Database,
	jobId: number,
	kind: Exclude<TranscriptKind, TranscriptKind.Step>,
	message: string,
	createdAt: Date,
	statusChange: JobStatus | null = null
): void {
	db.transaction(() => {
		const sequence = nextTranscriptSequence(db, jobId);
		appendTranscriptEntry(db, jobId, sequence, kind, message, createdAt, statusChange);
		if (statusChange !== null) {
			updateJobStatus(db, jobId, statusChange, createdAt);
		}
	})();
}

export function listTranscriptEntries(db: Database.Database, jobId: number): JobTranscriptEntry[] {
	const rows = db
		.prepare(
			"SELECT id, job_id AS jobId, sequence, job_transcript_kind_id AS jobTranscriptKindId, text, created_at AS createdAt, job_status_id AS jobStatusId FROM job_transcript_entry WHERE job_id = ? ORDER BY sequence"
		)
		.all(jobId) as JobTranscriptEntryRow[];
	return rows.map(mapTranscriptEntryRow);
}

// UNIQUE(job_id, field_name) plus the upsert makes the latest write win. safe_value is derived
// from sensitivityType here — callers never compute or pass a masked value themselves.
export function upsertJobIngredient(
	db: Database.Database,
	jobId: number,
	fieldName: string,
	rawValue: string,
	sensitivityType: SensitivityType,
	createdAt: Date
): void {
	const safeValue = maskValue(rawValue, sensitivityType);
	db.prepare(
		`INSERT INTO job_ingredient (job_id, field_name, raw_value, safe_value, sensitivity_type_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT (job_id, field_name) DO UPDATE SET raw_value = excluded.raw_value, safe_value = excluded.safe_value,
		   sensitivity_type_id = excluded.sensitivity_type_id, created_at = excluded.created_at`
	).run(jobId, fieldName, rawValue, safeValue, sensitivityType, toDbDate(createdAt));
}

export function listSafeJobIngredients(db: Database.Database, jobId: number): SafeIngredient[] {
	const rows = db
		.prepare(
			"SELECT field_name AS fieldName, safe_value AS safeValue, sensitivity_type_id AS sensitivityTypeId FROM job_ingredient WHERE job_id = ? ORDER BY field_name"
		)
		.all(jobId) as JobIngredientRow[];
	return rows.map(mapSafeIngredientRow);
}

export function getSafeJobIngredientByFieldName(db: Database.Database, jobId: number, fieldName: string): SafeIngredient | undefined {
	const row = db
		.prepare(
			"SELECT field_name AS fieldName, safe_value AS safeValue, sensitivity_type_id AS sensitivityTypeId FROM job_ingredient WHERE job_id = ? AND field_name = ?"
		)
		.get(jobId, fieldName) as JobIngredientRow | undefined;
	return row ? mapSafeIngredientRow(row) : undefined;
}

// Unused for now (no export/reporting feature exists yet) — exists to make the safe/raw
// boundary real and enforced by type, not because something consumes it yet.
export function listSensitiveJobIngredients(db: Database.Database, jobId: number): SensitiveIngredient[] {
	const rows = db
		.prepare(
			"SELECT field_name AS fieldName, raw_value AS rawValue, safe_value AS safeValue, sensitivity_type_id AS sensitivityTypeId FROM job_ingredient WHERE job_id = ? ORDER BY field_name"
		)
		.all(jobId) as JobIngredientRow[];
	return rows.map(mapSensitiveIngredientRow);
}

// UNIQUE(job_id, field_name) plus the upsert makes the latest write win. safe_value is derived
// from sensitivityType here — callers never compute or pass a masked value themselves.
export function upsertJobResult(
	db: Database.Database,
	jobId: number,
	fieldName: string,
	rawValue: string,
	sensitivityType: SensitivityType,
	createdAt: Date
): void {
	const safeValue = maskValue(rawValue, sensitivityType);
	db.prepare(
		`INSERT INTO job_result (job_id, field_name, raw_value, safe_value, sensitivity_type_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT (job_id, field_name) DO UPDATE SET raw_value = excluded.raw_value, safe_value = excluded.safe_value,
		   sensitivity_type_id = excluded.sensitivity_type_id, created_at = excluded.created_at`
	).run(jobId, fieldName, rawValue, safeValue, sensitivityType, toDbDate(createdAt));
}

export function listSafeJobResults(db: Database.Database, jobId: number): SafeResult[] {
	const rows = db
		.prepare(
			"SELECT field_name AS fieldName, safe_value AS safeValue, sensitivity_type_id AS sensitivityTypeId FROM job_result WHERE job_id = ? ORDER BY field_name"
		)
		.all(jobId) as JobResultRow[];
	return rows.map(mapSafeResultRow);
}

// Unused for now (no export/reporting feature exists yet) — exists to make the safe/raw
// boundary real and enforced by type, not because something consumes it yet.
export function listSensitiveJobResults(db: Database.Database, jobId: number): SensitiveResult[] {
	const rows = db
		.prepare(
			"SELECT field_name AS fieldName, raw_value AS rawValue, safe_value AS safeValue, sensitivity_type_id AS sensitivityTypeId FROM job_result WHERE job_id = ? ORDER BY field_name"
		)
		.all(jobId) as JobResultRow[];
	return rows.map(mapSensitiveResultRow);
}
