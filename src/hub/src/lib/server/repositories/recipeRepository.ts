import type Database from "better-sqlite3";

import { fromDbDate, toDbDate } from "../db/dates.ts";
import { RecipeStatus } from "../db/recipeStatus.ts";
import { validateRecipeDefinition } from "../recipeDefinitionValidation.ts";

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
}

export interface CreateDraftRecipeParams {
	customerApplicationXrefId: number;
	name: string;
	goal: string;
	definition: RecipeDefinition;
	sourceTrainingRunId: string | null;
	createdAt: Date;
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
}

const RECIPE_SELECT = `
	SELECT id, customer_application_xref_id AS customerApplicationXrefId, recipe_status_id AS recipeStatusId,
	       version, name, goal, definition, source_training_run_id AS sourceTrainingRunId,
	       created_at AS createdAt, published_at AS publishedAt
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
		publishedAt: fromDbDate(row.publishedAt)
	};
}

// An invalid definition (duplicate ids, unknown references/jump targets, invalid enum/action
// values, or nesting deeper than one level) is rejected here — before it is ever persisted or dispatched.
export function createDraftRecipe(db: Database.Database, params: CreateDraftRecipeParams): Recipe {
	const errors = validateRecipeDefinition(params.definition);
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
		publishedAt: null
	};
}

export function getRecipeById(db: Database.Database, id: number): Recipe | undefined {
	const row = db.prepare(`${RECIPE_SELECT} WHERE id = ?`).get(id) as RecipeRow | undefined;
	return row ? mapRecipeRow(row) : undefined;
}

export function getRecipeByIdAndVersion(db: Database.Database, id: number, version: number): Recipe | undefined {
	const row = db.prepare(`${RECIPE_SELECT} WHERE id = ? AND version = ?`).get(id, version) as RecipeRow | undefined;
	return row ? mapRecipeRow(row) : undefined;
}

// Only the Draft -> Released transition is permitted: the conditional UPDATE's affected-row
// count (not a prior SELECT) is the arbiter, mirroring jobRepository's updateJobStatus no-op
// pattern, so calling this on an already-published Recipe is a silent no-op, never an error.
export function publishRecipe(db: Database.Database, id: number, publishedAt: Date): Recipe | undefined {
	return db.transaction((): Recipe | undefined => {
		const candidate = db.prepare(`${RECIPE_SELECT} WHERE id = ?`).get(id) as RecipeRow | undefined;
		if (!candidate) {
			return undefined;
		}

		const publishedAtStr = toDbDate(publishedAt);
		const { changes } = db
			.prepare("UPDATE recipe SET recipe_status_id = ?, published_at = ? WHERE id = ? AND recipe_status_id = ?")
			.run(RecipeStatus.Released, publishedAtStr, id, RecipeStatus.Draft);
		if (changes === 0) {
			return undefined;
		}

		return mapRecipeRow({ ...candidate, recipeStatusId: RecipeStatus.Released, publishedAt: publishedAtStr });
	})();
}
