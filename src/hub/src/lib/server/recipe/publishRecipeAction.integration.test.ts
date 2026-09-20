import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { JobStatus } from "../storage/db/jobStatus";
import { JobType } from "../storage/db/jobType";
import { RecipeStatus } from "../storage/db/recipeStatus";
import { insertJob, updateJobStatus } from "../storage/repositories/jobRepository";
import { createDraftRecipe, getRecipeById, publishRecipe } from "../storage/repositories/recipeRepository";

import { publishRecipeAction } from "./publishRecipeAction";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

const definition: RecipeDefinition = {
	schemaVersion: 1,
	inputs: {},
	outputs: { status: { type: "string", description: "Outcome", required: true, nullable: false, sensitive: false } },
	steps: [
		{ id: "start", action: "open", args: ["https://example.test"] },
		{ id: "complete", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }] }
	],
	recoveries: []
};

describe("publishRecipeAction", () => {
	const getDb = useIntegrationTestDb();

	function seed(db: Database.Database): void {
		db.exec(`
			INSERT INTO customer (id, name) VALUES (1, 'Acme');
			INSERT INTO application (id, name) VALUES (1, 'Widgets'), (2, 'Gadgets');
			INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1), (2, 1, 2);
		`);
	}

	function draft(db: Database.Database, xrefId = 1, name = "Draft name") {
		return createDraftRecipe(db, {
			customerApplicationXrefId: xrefId,
			name,
			goal: "Goal",
			definition,
			sourceTrainingRunId: null,
			createdAt: new Date("2026-09-20T00:00:00.000Z")
		});
	}

	function trialJob(db: Database.Database, recipeId: number, status: JobStatus, xrefId = 1): number {
		const job = insertJob(db, {
			jobType: JobType.Recipe,
			name: "Trial",
			customerApplicationXrefId: xrefId,
			recipeId,
			mode: "Trial",
			allowlist: "https://example.test",
			stepTimeoutMs: 15_000,
			createdAt: new Date("2026-09-20T00:01:00.000Z")
		});
		updateJobStatus(db, job.id, status);
		return job.id;
	}

	function qualifiedDraft(db: Database.Database, xrefId = 1) {
		const recipe = draft(db, xrefId);
		const jobId = trialJob(db, recipe.id, JobStatus.CompletedSuccess, xrefId);
		return { recipe, jobId };
	}

	function published(db: Database.Database, xrefId = 1, name = "Live") {
		return publishRecipe(db, draft(db, xrefId, name).id, new Date("2026-09-20T00:02:00.000Z"))!;
	}

	it("publishes a qualified draft with a trimmed name and returns the saved summary", () => {
		seed(getDb());
		const { recipe, jobId } = qualifiedDraft(getDb());

		const result = publishRecipeAction(getDb(), String(recipe.id), { name: "  Final name  " });

		expect(result).toEqual({
			status: 200,
			body: { data: expect.objectContaining({ id: recipe.id, name: "Final name", state: "Published", qualifiedByJobId: jobId, replacesRecipeId: null }) }
		});
		expect(getRecipeById(getDb(), recipe.id)?.recipeStatusId).toBe(RecipeStatus.Released);
	});

	it("archives the replaced Recipe and links the new one to it", () => {
		seed(getDb());
		const old = published(getDb());
		const { recipe } = qualifiedDraft(getDb());

		const result = publishRecipeAction(getDb(), String(recipe.id), { name: "Next", replacesRecipeId: old.id });

		expect(result.status).toBe(200);
		expect(getRecipeById(getDb(), old.id)?.recipeStatusId).toBe(RecipeStatus.Archived);
		expect(getRecipeById(getDb(), recipe.id)?.replacesRecipeId).toBe(old.id);
	});

	it("404s for an unknown or non-numeric Recipe", () => {
		expect(publishRecipeAction(getDb(), "999", { name: "x" })).toEqual({ status: 404, body: { error: "Recipe 999 not found" } });
		expect(publishRecipeAction(getDb(), "abc", { name: "x" }).status).toBe(404);
	});

	it.each([
		["missing", undefined],
		["not a string", 5],
		["blank", "   "],
		["too long", "x".repeat(101)]
	])("400s for a %s name", (_label, name) => {
		seed(getDb());
		const { recipe } = qualifiedDraft(getDb());

		expect(publishRecipeAction(getDb(), String(recipe.id), { name }).status).toBe(400);
		expect(getRecipeById(getDb(), recipe.id)?.recipeStatusId).toBe(RecipeStatus.Draft);
	});

	it("400s for an unqualified draft, including one whose Trial failed", () => {
		seed(getDb());
		const recipe = draft(getDb());
		expect(publishRecipeAction(getDb(), String(recipe.id), { name: "x" })).toEqual({ status: 400, body: { error: "Recipe has no successful Trial Job" } });

		trialJob(getDb(), recipe.id, JobStatus.CompletedFailed);
		expect(publishRecipeAction(getDb(), String(recipe.id), { name: "x" }).status).toBe(400);
	});

	it("409s when the Recipe is already published", () => {
		seed(getDb());
		const { recipe } = qualifiedDraft(getDb());
		publishRecipeAction(getDb(), String(recipe.id), { name: "x" });

		expect(publishRecipeAction(getDb(), String(recipe.id), { name: "y" })).toEqual({ status: 409, body: { error: "Recipe is not a draft" } });
	});

	it("400s when the replaced Recipe is unknown, a draft, or in another Application", () => {
		seed(getDb());
		const { recipe } = qualifiedDraft(getDb());
		const otherDraft = draft(getDb());
		const crossApplication = published(getDb(), 2);

		for (const replacesRecipeId of [999, otherDraft.id, crossApplication.id]) {
			expect(publishRecipeAction(getDb(), String(recipe.id), { name: "x", replacesRecipeId }).status).toBe(400);
		}
		expect(getRecipeById(getDb(), crossApplication.id)?.recipeStatusId).toBe(RecipeStatus.Released);
		expect(getRecipeById(getDb(), recipe.id)?.recipeStatusId).toBe(RecipeStatus.Draft);
	});

	it("400s when replacesRecipeId is not an integer", () => {
		seed(getDb());
		const { recipe } = qualifiedDraft(getDb());

		expect(publishRecipeAction(getDb(), String(recipe.id), { name: "x", replacesRecipeId: 1.5 }).status).toBe(400);
	});

	it("409s when the replaced Recipe was already archived by another publish", () => {
		seed(getDb());
		const old = published(getDb());
		const first = qualifiedDraft(getDb()).recipe;
		const second = qualifiedDraft(getDb()).recipe;
		publishRecipeAction(getDb(), String(first.id), { name: "first", replacesRecipeId: old.id });

		const result = publishRecipeAction(getDb(), String(second.id), { name: "second", replacesRecipeId: old.id });

		expect(result).toEqual({ status: 409, body: { error: `Recipe ${old.id} is no longer published` } });
		expect(getRecipeById(getDb(), second.id)?.recipeStatusId).toBe(RecipeStatus.Draft);
	});
});
