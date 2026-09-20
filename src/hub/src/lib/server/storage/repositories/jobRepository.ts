import type Database from "better-sqlite3";

import { fromDbDate, toDbDate } from "../db/dates.ts";
import { JobStatus } from "../db/jobStatus.ts";
import { TranscriptKind } from "../db/jobTranscriptKind.ts";
import { JobType } from "../db/jobType.ts";
import { SensitivityType } from "../db/sensitivityType.ts";

import type { StepTargetDescription } from "$lib/types/job";
import type { ChildStep } from "$lib/types/recipeDefinition";

// Intervention-Requested is a halted, non-terminal state (ARCHITECTURE.md's Core Loop) — it waits
// for a human or an intervention timeout, it doesn't end the Job.
export const TERMINAL_JOB_STATUSES = [JobStatus.CompletedSuccess, JobStatus.CompletedFailed, JobStatus.CompletedCancelled, JobStatus.CompletedError];

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

export interface TrainingRunJob {
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	alternateGoals: string[];
	syntheticDataConfirmed: boolean;
	stepTimeoutMs: number;
	// Reported by the Runner (names only, never values) alongside its first Step's dslStep report
	// — unknown at Job creation, so this is always [] until then.
	credentialNames: string[];
}

export interface RecipeJob {
	recipeId: number | null;
	mode: "Trial" | "Execute";
	allowlist: string;
	stepTimeoutMs: number;
}

interface JobBase {
	id: number;
	name: string;
	customerApplicationXrefId: number;
	jobStatusId: JobStatus;
	runnerId: number | null;
	createdAt: Date;
	startedAt: Date | null;
	heartbeatOn: Date | null;
	completedAt: Date | null;
}

export type Job =
	| (JobBase & { jobType: JobType.TrainingRun; details: TrainingRunJob })
	| (JobBase & { jobType: JobType.Recipe; details: RecipeJob });

export type InsertJobParams =
	| {
			jobType: JobType.TrainingRun;
			name: string;
			customerApplicationXrefId: number;
			goal: string;
			startingUrl: string;
			allowlist: string;
			maxSteps: number;
			alternateGoals: string[];
			syntheticDataConfirmed: boolean;
			stepTimeoutMs: number;
			createdAt: Date;
	  }
	| {
			jobType: JobType.Recipe;
			name: string;
			customerApplicationXrefId: number;
			recipeId: number | null;
			mode: "Trial" | "Execute";
			allowlist: string;
			stepTimeoutMs: number;
			createdAt: Date;
	  };

export interface TranscriptFieldRef {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export interface StepTranscriptText {
	stepId: string;
	outcome: "succeeded" | "failed";
	parentStepId?: string;
	targetDescription: StepTargetDescription;
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
	name: string;
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
	trainingAlternateGoals: string | null;
	trainingSyntheticDataConfirmed: number | null;
	trainingStepTimeoutMs: number | null;
	trainingCredentialNames: string | null;
	recipeId: number | null;
	recipeJobId: number | null;
	recipeMode: string | null;
	recipeAllowlist: string | null;
	recipeStepTimeoutMs: number | null;
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
	SELECT job.id, job.name, job.customer_application_xref_id AS customerApplicationXrefId, job.job_type_id AS jobTypeId,
	       job.job_status_id AS jobStatusId, job.runner_id AS runnerId, job.created_at AS createdAt,
	       job.started_at AS startedAt, job.heartbeat_on AS heartbeatOn, job.completed_at AS completedAt,
	       training_job.goal AS trainingGoal, training_job.starting_url AS trainingStartingUrl,
	       training_job.allowlist AS trainingAllowlist, training_job.max_steps AS trainingMaxSteps,
	       training_job.alternate_goals AS trainingAlternateGoals,
	       training_job.synthetic_data_confirmed AS trainingSyntheticDataConfirmed,
	       training_job.step_timeout_ms AS trainingStepTimeoutMs,
	       training_job.credential_names AS trainingCredentialNames,
	       recipe_job.recipe_id AS recipeId, recipe_job.job_id AS recipeJobId, recipe_job.mode AS recipeMode,
	       recipe_job.allowlist AS recipeAllowlist, recipe_job.step_timeout_ms AS recipeStepTimeoutMs
	FROM job
	LEFT JOIN training_job ON training_job.job_id = job.id
	LEFT JOIN recipe_job ON recipe_job.job_id = job.id
`;

function mapJobRow(row: JobRow): Job {
	const base: JobBase = {
		id: row.id,
		name: row.name,
		customerApplicationXrefId: row.customerApplicationXrefId,
		jobStatusId: row.jobStatusId,
		runnerId: row.runnerId,
		createdAt: fromDbDate(row.createdAt),
		startedAt: fromDbDate(row.startedAt),
		heartbeatOn: fromDbDate(row.heartbeatOn),
		completedAt: fromDbDate(row.completedAt)
	};

	if (row.jobTypeId === JobType.TrainingRun) {
		if (
			row.trainingGoal === null ||
			row.trainingStartingUrl === null ||
			row.trainingAllowlist === null ||
			row.trainingMaxSteps === null ||
			row.trainingAlternateGoals === null ||
			row.trainingSyntheticDataConfirmed === null ||
			row.trainingStepTimeoutMs === null ||
			row.trainingCredentialNames === null
		) {
			throw new Error(`Job ${row.id} is job_type Training but has no training_job row`);
		}
		return {
			...base,
			jobType: JobType.TrainingRun,
			details: {
				goal: row.trainingGoal,
				startingUrl: row.trainingStartingUrl,
				allowlist: row.trainingAllowlist,
				maxSteps: row.trainingMaxSteps,
				alternateGoals: JSON.parse(row.trainingAlternateGoals) as string[],
				syntheticDataConfirmed: row.trainingSyntheticDataConfirmed !== 0,
				stepTimeoutMs: row.trainingStepTimeoutMs,
				credentialNames: JSON.parse(row.trainingCredentialNames) as string[]
			}
		};
	}

	if (row.jobTypeId === JobType.Recipe) {
		if (row.recipeJobId === null || row.recipeMode === null || row.recipeAllowlist === null || row.recipeStepTimeoutMs === null) {
			throw new Error(`Job ${row.id} is job_type Recipe but has no recipe_job row`);
		}
		if (row.recipeMode !== "Trial" && row.recipeMode !== "Execute") {
			throw new Error(`Job ${row.id} has an invalid recipe_job mode: ${row.recipeMode}`);
		}
		return {
			...base,
			jobType: JobType.Recipe,
			details: { recipeId: row.recipeId, mode: row.recipeMode, allowlist: row.recipeAllowlist, stepTimeoutMs: row.recipeStepTimeoutMs }
		};
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
			.prepare("INSERT INTO job (name, customer_application_xref_id, job_type_id, job_status_id, created_at) VALUES (?, ?, ?, ?, ?)")
			.run(params.name, params.customerApplicationXrefId, params.jobType, JobStatus.Pending, toDbDate(params.createdAt));
		const jobId = Number(lastInsertRowid);

		const base: JobBase = {
			id: jobId,
			name: params.name,
			customerApplicationXrefId: params.customerApplicationXrefId,
			jobStatusId: JobStatus.Pending,
			runnerId: null,
			createdAt: params.createdAt,
			startedAt: null,
			heartbeatOn: null,
			completedAt: null
		};

		if (params.jobType === JobType.TrainingRun) {
			db.prepare(
				`INSERT INTO training_job (job_id, goal, starting_url, allowlist, max_steps, alternate_goals, synthetic_data_confirmed, step_timeout_ms)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				jobId,
				params.goal,
				params.startingUrl,
				params.allowlist,
				params.maxSteps,
				JSON.stringify(params.alternateGoals),
				params.syntheticDataConfirmed ? 1 : 0,
				params.stepTimeoutMs
			);
			return {
				...base,
				jobType: JobType.TrainingRun,
				details: {
					goal: params.goal,
					startingUrl: params.startingUrl,
					allowlist: params.allowlist,
					maxSteps: params.maxSteps,
					alternateGoals: params.alternateGoals,
					syntheticDataConfirmed: params.syntheticDataConfirmed,
					stepTimeoutMs: params.stepTimeoutMs,
					credentialNames: []
				}
			};
		}

		db.prepare("INSERT INTO recipe_job (job_id, recipe_id, mode, allowlist, step_timeout_ms) VALUES (?, ?, ?, ?, ?)").run(
			jobId,
			params.recipeId,
			params.mode,
			params.allowlist,
			params.stepTimeoutMs
		);
		return {
			...base,
			jobType: JobType.Recipe,
			details: { recipeId: params.recipeId, mode: params.mode, allowlist: params.allowlist, stepTimeoutMs: params.stepTimeoutMs }
		};
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

// Names only, never values (R011-adjacent — nothing about a credential's value is ever sent to
// Hub) — overwritten wholesale each time the Runner reports a fresh list, since it's the only
// source of truth for what its own RUNNER_CREDENTIAL_* env vars currently declare.
export function updateTrainingRunJobCredentialNames(db: Database.Database, jobId: number, credentialNames: string[]): void {
	db.prepare("UPDATE training_job SET credential_names = ? WHERE job_id = ?").run(JSON.stringify(credentialNames), jobId);
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
	statusChange?: JobStatus | null
): void;
export function appendAutoSequencedTranscriptEntry(
	db: Database.Database,
	jobId: number,
	kind: TranscriptKind.Step,
	details: StepTranscriptText,
	createdAt: Date
): void;
export function appendAutoSequencedTranscriptEntry(
	db: Database.Database,
	jobId: number,
	kind: TranscriptKind,
	messageOrDetails: string | StepTranscriptText,
	createdAt: Date,
	statusChange: JobStatus | null = null
): void {
	db.transaction(() => {
		const sequence = nextTranscriptSequence(db, jobId);
		if (kind === TranscriptKind.Step) {
			appendTranscriptEntry(db, jobId, sequence, kind, messageOrDetails as StepTranscriptText, createdAt);
			return;
		}
		appendTranscriptEntry(db, jobId, sequence, kind, messageOrDetails as string, createdAt, statusChange);
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

// Runner dispatch (runnerActions.ts's Recipe Job poll branch) needs the raw values to build the
// `ingredients` payload — the Runner fills real form fields with them, unlike every Hub-facing read.
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

export interface JobStepArtifact {
	id: number;
	jobId: number;
	stepId: string;
	filePath: string;
	createdAt: Date;
}

interface JobStepArtifactRow {
	id: number;
	jobId: number;
	stepId: string;
	filePath: string;
	createdAt: string;
}

// filePath is whatever artifactStorage.ts already wrote the image bytes to — this only persists
// the pointer, mirroring the design where storage/DB-metadata are separate concerns.
export function insertJobStepArtifact(db: Database.Database, jobId: number, stepId: string, filePath: string, createdAt: Date): JobStepArtifact {
	const { lastInsertRowid } = db
		.prepare("INSERT INTO job_step_artifact (job_id, step_id, file_path, created_at) VALUES (?, ?, ?, ?)")
		.run(jobId, stepId, filePath, toDbDate(createdAt));
	return { id: Number(lastInsertRowid), jobId, stepId, filePath, createdAt };
}

const JOB_STEP_ARTIFACT_SELECT =
	"SELECT id, job_id AS jobId, step_id AS stepId, file_path AS filePath, created_at AS createdAt FROM job_step_artifact";

function mapJobStepArtifactRow(row: JobStepArtifactRow): JobStepArtifact {
	return { id: row.id, jobId: row.jobId, stepId: row.stepId, filePath: row.filePath, createdAt: fromDbDate(row.createdAt) };
}

export function getJobStepArtifactById(db: Database.Database, id: number): JobStepArtifact | undefined {
	const row = db.prepare(`${JOB_STEP_ARTIFACT_SELECT} WHERE id = ?`).get(id) as JobStepArtifactRow | undefined;
	return row ? mapJobStepArtifactRow(row) : undefined;
}

// Looks up the screenshot the Runner just uploaded for a Training Step (by stepId, C004) so the
// next-Step prompt can be built with it in the same `steps` call. Newest first — a stepId is
// unique per Job in practice, but this tolerates a re-upload without picking a stale row.
export function getLatestJobStepArtifact(db: Database.Database, jobId: number, stepId: string): JobStepArtifact | undefined {
	const row = db.prepare(`${JOB_STEP_ARTIFACT_SELECT} WHERE job_id = ? AND step_id = ? ORDER BY id DESC LIMIT 1`).get(jobId, stepId) as
		| JobStepArtifactRow
		| undefined;
	return row ? mapJobStepArtifactRow(row) : undefined;
}

// Ordered oldest-to-newest so the Job screen's diagnostic screenshot (the last entry) is
// whichever Step the Runner most recently reported/exited on.
export function listJobStepArtifactsForJob(db: Database.Database, jobId: number): JobStepArtifact[] {
	const rows = db.prepare(`${JOB_STEP_ARTIFACT_SELECT} WHERE job_id = ? ORDER BY id`).all(jobId) as JobStepArtifactRow[];
	return rows.map(mapJobStepArtifactRow);
}

export interface TrainingRunJobStep {
	id: number;
	jobId: number;
	stepId: string;
	definition: ChildStep;
	createdAt: Date;
}

interface TrainingRunJobStepRow {
	id: number;
	jobId: number;
	stepId: string;
	definition: string;
	createdAt: string;
}

const TRAINING_RUN_JOB_STEP_SELECT =
	"SELECT id, job_id AS jobId, step_id AS stepId, definition, created_at AS createdAt FROM training_job_step";

function mapTrainingRunJobStepRow(row: TrainingRunJobStepRow): TrainingRunJobStep {
	return { id: row.id, jobId: row.jobId, stepId: row.stepId, definition: JSON.parse(row.definition) as ChildStep, createdAt: fromDbDate(row.createdAt) };
}

// Persists a Step before it is ever handed to the Runner — whether the fixed first Step
// (jobActions.ts, at Job creation) or a later LLM-derived one (runnerActions.ts, right after
// deriveNextStep succeeds) — so a later transcript row's stepId can be correlated back to the
// actual DSL action/args a Step used (the transcript alone only keeps message/outcome).
export function insertTrainingRunJobStep(db: Database.Database, jobId: number, step: ChildStep, createdAt: Date): TrainingRunJobStep {
	const { lastInsertRowid } = db
		.prepare("INSERT INTO training_job_step (job_id, step_id, definition, created_at) VALUES (?, ?, ?, ?)")
		.run(jobId, step.id, JSON.stringify(step), toDbDate(createdAt));
	return { id: Number(lastInsertRowid), jobId, stepId: step.id, definition: step, createdAt };
}

export function listTrainingRunJobSteps(db: Database.Database, jobId: number): TrainingRunJobStep[] {
	const rows = db.prepare(`${TRAINING_RUN_JOB_STEP_SELECT} WHERE job_id = ? ORDER BY id`).all(jobId) as TrainingRunJobStepRow[];
	return rows.map(mapTrainingRunJobStepRow);
}
