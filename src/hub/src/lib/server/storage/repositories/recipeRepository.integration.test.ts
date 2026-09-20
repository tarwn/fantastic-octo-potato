import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../db/_test/integrationTestDb";
import { JobStatus } from "../db/jobStatus";
import { JobType } from "../db/jobType";
import { RecipeStatus } from "../db/recipeStatus";

import { insertJob, updateJobStatus } from "./jobRepository";
import {
	createDraftRecipe,
	getQualifyingTrialJobIds,
	getRecipeById,
	getRecipeByIdAndVersion,
	publishRecipe,
	RecipePublishConflictError
} from "./recipeRepository";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

function seedXref(db: Database.Database): void {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
	`);
}

const validDefinition: RecipeDefinition = {
	schemaVersion: 1,
	inputs: {
		startUrl: { type: "string", description: "Application starting URL", required: true, nullable: false, sensitive: false }
	},
	outputs: {
		status: { type: "string", description: "Search outcome", required: true, nullable: false, sensitive: false }
	},
	steps: [
		{ id: "start", action: "open", args: [{ ref: "input", name: "startUrl" }] },
		{ id: "mark_found", action: "assign", args: [{ ref: "output", name: "status" }, "found"] },
		{
			id: "complete",
			action: "finish",
			args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }]
		}
	],
	recoveries: []
};

function createValidDraft(db: Database.Database) {
	return createDraftRecipe(db, {
		customerApplicationXrefId: 1,
		name: "Read a status",
		goal: "Find the status",
		definition: validDefinition,
		sourceTrainingRunId: null,
		createdAt: new Date("2026-09-16T00:00:00.000Z")
	});
}

function insertRecipeJob(db: Database.Database, recipeId: number, mode: "Trial" | "Execute", status: JobStatus): number {
	const job = insertJob(db, {
		jobType: JobType.Recipe,
		name: "Job",
		customerApplicationXrefId: 1,
		recipeId,
		mode,
		allowlist: "https://example.com",
		stepTimeoutMs: 15_000,
		createdAt: new Date("2026-09-16T02:00:00.000Z")
	});
	updateJobStatus(db, job.id, status);
	return job.id;
}

describe("recipeRepository", () => {
	const getDb = useIntegrationTestDb();

	describe("createDraftRecipe", () => {
		it("creates a draft Recipe at version 1", () => {
			seedXref(getDb());

			const recipe = createValidDraft(getDb());

			expect(recipe).toEqual({
				id: recipe.id,
				customerApplicationXrefId: 1,
				recipeStatusId: RecipeStatus.Draft,
				version: 1,
				name: "Read a status",
				goal: "Find the status",
				definition: validDefinition,
				sourceTrainingRunId: null,
				createdAt: new Date("2026-09-16T00:00:00.000Z"),
				publishedAt: null,
				replacesRecipeId: null
			});
			expect(getRecipeById(getDb(), recipe.id)).toEqual(recipe);
		});

		it("rejects an invalid definition before it is persisted", () => {
			seedXref(getDb());

			expect(() =>
				createDraftRecipe(getDb(), {
					customerApplicationXrefId: 1,
					name: "Bad recipe",
					goal: "Break validation",
					definition: { ...validDefinition, steps: [{ id: "s1", action: "goto", args: ["missing"] }] },
					sourceTrainingRunId: null,
					createdAt: new Date("2026-09-16T00:00:00.000Z")
				})
			).toThrow(/Invalid Recipe definition/);
			expect(getDb().prepare("SELECT COUNT(*) as count FROM recipe").get()).toEqual({ count: 0 });
		});
	});

	describe("publishRecipe", () => {
		it("transitions a draft Recipe to Released and sets publishedAt", () => {
			seedXref(getDb());
			const draft = createValidDraft(getDb());
			const publishedAt = new Date("2026-09-16T01:00:00.000Z");

			const published = publishRecipe(getDb(), draft.id, publishedAt);

			expect(published).toEqual({ ...draft, recipeStatusId: RecipeStatus.Released, publishedAt });
			expect(getRecipeById(getDb(), draft.id)).toEqual(published);
		});

		it("no-ops when the Recipe is already published", () => {
			seedXref(getDb());
			const draft = createValidDraft(getDb());
			const firstPublish = publishRecipe(getDb(), draft.id, new Date("2026-09-16T01:00:00.000Z"));

			const secondPublish = publishRecipe(getDb(), draft.id, new Date("2026-09-16T02:00:00.000Z"));

			expect(secondPublish).toBeUndefined();
			expect(getRecipeById(getDb(), draft.id)).toEqual(firstPublish);
		});

		it("returns undefined for an unknown Recipe id", () => {
			expect(publishRecipe(getDb(), 999, new Date("2026-09-16T01:00:00.000Z"))).toBeUndefined();
		});

		it("renames the Recipe and archives the replaced Recipe, linking the new one to it, in one step", () => {
			seedXref(getDb());
			const old = createValidDraft(getDb());
			publishRecipe(getDb(), old.id, new Date("2026-09-16T01:00:00.000Z"));
			const draft = createValidDraft(getDb());

			const published = publishRecipe(getDb(), draft.id, new Date("2026-09-16T02:00:00.000Z"), { name: "Renamed", replacesRecipeId: old.id });

			expect(published).toEqual({ ...draft, name: "Renamed", recipeStatusId: RecipeStatus.Released, publishedAt: new Date("2026-09-16T02:00:00.000Z"), replacesRecipeId: old.id });
			expect(getRecipeById(getDb(), old.id)?.recipeStatusId).toBe(RecipeStatus.Archived);
		});

		it("rolls everything back with a conflict when the replaced Recipe is no longer published", () => {
			seedXref(getDb());
			const notPublished = createValidDraft(getDb());
			const draft = createValidDraft(getDb());

			expect(() => publishRecipe(getDb(), draft.id, new Date("2026-09-16T02:00:00.000Z"), { name: "Renamed", replacesRecipeId: notPublished.id })).toThrow(
				RecipePublishConflictError
			);
			expect(getRecipeById(getDb(), draft.id)).toEqual(draft);
		});
	});

	describe("getQualifyingTrialJobIds", () => {
		it("maps a Recipe to its earliest Trial Job that completed successfully, ignoring other modes and outcomes", () => {
			seedXref(getDb());
			const qualified = createValidDraft(getDb());
			const failedOnly = createValidDraft(getDb());
			const executeOnly = createValidDraft(getDb());
			insertRecipeJob(getDb(), failedOnly.id, "Trial", JobStatus.CompletedFailed);
			insertRecipeJob(getDb(), executeOnly.id, "Execute", JobStatus.CompletedSuccess);
			const first = insertRecipeJob(getDb(), qualified.id, "Trial", JobStatus.CompletedSuccess);
			insertRecipeJob(getDb(), qualified.id, "Trial", JobStatus.CompletedSuccess);

			const result = getQualifyingTrialJobIds(getDb(), [qualified.id, failedOnly.id, executeOnly.id]);

			expect(result).toEqual(new Map([[qualified.id, first]]));
		});

		it("returns an empty map without querying for no Recipes", () => {
			expect(getQualifyingTrialJobIds(getDb(), [])).toEqual(new Map());
		});
	});

	describe("getRecipeByIdAndVersion", () => {
		it("fetches a Recipe matching both id and version", () => {
			seedXref(getDb());
			const draft = createValidDraft(getDb());

			expect(getRecipeByIdAndVersion(getDb(), draft.id, 1)).toEqual(draft);
			expect(getRecipeByIdAndVersion(getDb(), draft.id, 2)).toBeUndefined();
		});
	});

	it("keeps a Recipe's definition unchanged once a Job references it", () => {
		seedXref(getDb());
		const draft = createValidDraft(getDb());
		publishRecipe(getDb(), draft.id, new Date("2026-09-16T01:00:00.000Z"));
		insertJob(getDb(), {
			jobType: JobType.Recipe,
			name: "Sample recipe",
			customerApplicationXrefId: 1,
			recipeId: draft.id,
			mode: "Execute",
			allowlist: "https://example.com",
			stepTimeoutMs: 15_000,
			createdAt: new Date("2026-09-16T02:00:00.000Z")
		});

		const recipe = getRecipeById(getDb(), draft.id);

		expect(recipe?.definition).toEqual(validDefinition);
	});
});
