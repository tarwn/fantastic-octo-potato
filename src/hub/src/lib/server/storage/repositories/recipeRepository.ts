import type Database from "better-sqlite3";

import { validateRecipeDefinition } from "../../recipe/recipeDefinitionValidation.ts";
import { fromDbDate, toDbDate } from "../db/dates.ts";
import { JobStatus } from "../db/jobStatus.ts";
import { RecipeStatus } from "../db/recipeStatus.ts";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

export interface Recipe {
	id: number;
	customerApplicationXrefId: number;
	recipeStatusId: RecipeStatus;
	version: number;
	name: string;
	goal: string;
	definition: RecipeDefinition;
	sourceTrainingRunId: string | null;
	createdAt: Date;
	publishedAt: Date | null;
	replacesRecipeId: number | null;
}

export interface CreateDraftRecipeParams {
	customerApplicationXrefId: number;
	name: string;
	goal: string;
	definition: RecipeDefinition;
	sourceTrainingRunId: string | null;
	createdAt: Date;
	// The source Training run's known-credential set, re-checked here since this is the last gate
	// before persistence — defaults to none for callers with no Training run behind the definition.
	knownCredentialNames?: string[];
}

interface RecipeRow {
	id: number;
	customerApplicationXrefId: number;
	recipeStatusId: number;
	version: number;
	name: string;
	goal: string;
	definition: string;
	sourceTrainingRunId: string | null;
	createdAt: string;
	publishedAt: string | null;
	replacesRecipeId: number | null;
}

const RECIPE_SELECT = `
	SELECT id, customer_application_xref_id AS customerApplicationXrefId, recipe_status_id AS recipeStatusId,
	       version, name, goal, definition, source_training_run_id AS sourceTrainingRunId,
	       created_at AS createdAt, published_at AS publishedAt,
	       replaces_recipe_id AS replacesRecipeId
	FROM recipe
`;

function mapRecipeRow(row: RecipeRow): Recipe {
	return {
		id: row.id,
		customerApplicationXrefId: row.customerApplicationXrefId,
		recipeStatusId: row.recipeStatusId,
		version: row.version,
		name: row.name,
		goal: row.goal,
		definition: JSON.parse(row.definition) as RecipeDefinition,
		sourceTrainingRunId: row.sourceTrainingRunId,
		createdAt: fromDbDate(row.createdAt),
		publishedAt: fromDbDate(row.publishedAt),
		replacesRecipeId: row.replacesRecipeId
	};
}

// An invalid definition (duplicate ids, unknown references/jump targets, invalid enum/action
// values, or nesting deeper than one level) is rejected here — before it is ever persisted or dispatched.
export function createDraftRecipe(db: Database.Database, params: CreateDraftRecipeParams): Recipe {
	const errors = validateRecipeDefinition(params.definition, new Set(params.knownCredentialNames ?? []));
	if (errors.length > 0) {
		throw new Error(`Invalid Recipe definition: ${errors.join("; ")}`);
	}

	const definitionJson = JSON.stringify(params.definition);
	const version = 1;
	const { lastInsertRowid } = db
		.prepare(
			`INSERT INTO recipe (customer_application_xref_id, recipe_status_id, version, name, goal, definition, source_training_run_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			params.customerApplicationXrefId,
			RecipeStatus.Draft,
			version,
			params.name,
			params.goal,
			definitionJson,
			params.sourceTrainingRunId,
			toDbDate(params.createdAt)
		);

	return {
		id: Number(lastInsertRowid),
		customerApplicationXrefId: params.customerApplicationXrefId,
		recipeStatusId: RecipeStatus.Draft,
		version,
		name: params.name,
		goal: params.goal,
		definition: params.definition,
		sourceTrainingRunId: params.sourceTrainingRunId,
		createdAt: params.createdAt,
		publishedAt: null,
		replacesRecipeId: null
	};
}

export function getRecipeById(db: Database.Database, id: number): Recipe | undefined {
	const row = db.prepare(`${RECIPE_SELECT} WHERE id = ?`).get(id) as RecipeRow | undefined;
	return row ? mapRecipeRow(row) : undefined;
}

// Lists every Recipe (draft and published) scoped to one Customer x Application, for Start
// Trial/Start Job to filter by state client-side rather than issuing two separate queries.
export function listRecipesForApplication(db: Database.Database, customerApplicationXrefId: number): Recipe[] {
	const rows = db
		.prepare(`${RECIPE_SELECT} WHERE customer_application_xref_id = ? ORDER BY name`)
		.all(customerApplicationXrefId) as RecipeRow[];
	return rows.map(mapRecipeRow);
}

export function getRecipeByIdAndVersion(db: Database.Database, id: number, version: number): Recipe | undefined {
	const row = db.prepare(`${RECIPE_SELECT} WHERE id = ? AND version = ?`).get(id, version) as RecipeRow | undefined;
	return row ? mapRecipeRow(row) : undefined;
}

export class RecipePublishConflictError extends Error {}

export interface PublishRecipeOptions {
	name?: string;
	replacesRecipeId?: number;
}

// Only the Draft -> Released transition is permitted: the conditional UPDATE's affected-row
// count (not a prior SELECT) is the arbiter, mirroring jobRepository's updateJobStatus no-op
// pattern, so calling this on an already-published Recipe is a silent no-op, never an error.
// The replaced Recipe is archived in the same transaction; if it is no longer a published Recipe
// of the same Customer x Application the whole publish rolls back with a RecipePublishConflictError.
export function publishRecipe(db: Database.Database, id: number, publishedAt: Date, options: PublishRecipeOptions = {}): Recipe | undefined {
	return db.transaction((): Recipe | undefined => {
		const candidate = db.prepare(`${RECIPE_SELECT} WHERE id = ?`).get(id) as RecipeRow | undefined;
		if (!candidate) {
			return undefined;
		}

		const name = options.name ?? candidate.name;
		const replacesRecipeId = options.replacesRecipeId ?? null;
		const publishedAtStr = toDbDate(publishedAt);
		const { changes } = db
			.prepare("UPDATE recipe SET recipe_status_id = ?, published_at = ?, name = ?, replaces_recipe_id = ? WHERE id = ? AND recipe_status_id = ?")
			.run(RecipeStatus.Released, publishedAtStr, name, replacesRecipeId, id, RecipeStatus.Draft);
		if (changes === 0) {
			return undefined;
		}

		if (replacesRecipeId !== null) {
			const archived = db
				.prepare("UPDATE recipe SET recipe_status_id = ? WHERE id = ? AND recipe_status_id = ? AND customer_application_xref_id = ?")
				.run(RecipeStatus.Archived, replacesRecipeId, RecipeStatus.Released, candidate.customerApplicationXrefId);
			if (archived.changes === 0) {
				throw new RecipePublishConflictError(`Recipe ${replacesRecipeId} is no longer published`);
			}
		}

		return mapRecipeRow({ ...candidate, name, recipeStatusId: RecipeStatus.Released, publishedAt: publishedAtStr, replacesRecipeId });
	})();
}

// Recipe definitions are immutable, so a Trial of this Recipe id succeeding is what qualifies it.
// Maps each qualified Recipe id to its earliest successful Trial Job.
export function getQualifyingTrialJobIds(db: Database.Database, recipeIds: number[]): Map<number, number> {
	if (recipeIds.length === 0) {
		return new Map();
	}

	const placeholders = recipeIds.map(() => "?").join(", ");
	const rows = db
		.prepare(
			`SELECT recipe_job.recipe_id AS recipeId, MIN(job.id) AS jobId
			 FROM recipe_job JOIN job ON job.id = recipe_job.job_id
			 WHERE recipe_job.mode = 'Trial' AND job.job_status_id = ? AND recipe_job.recipe_id IN (${placeholders})
			 GROUP BY recipe_job.recipe_id`
		)
		.all(JobStatus.CompletedSuccess, ...recipeIds) as { recipeId: number; jobId: number }[];
	return new Map(rows.map((row) => [row.recipeId, row.jobId]));
}
