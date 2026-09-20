import path from "node:path";

import { openDb } from "../../src/lib/server/storage/db/connection.ts";
import { JobStatus } from "../../src/lib/server/storage/db/jobStatus.ts";
import { JobType } from "../../src/lib/server/storage/db/jobType.ts";
import { insertJob, updateJobStatus } from "../../src/lib/server/storage/repositories/jobRepository.ts";
import { createDraftRecipe, publishRecipe } from "../../src/lib/server/storage/repositories/recipeRepository.ts";
import type { RecipeDefinition } from "../../src/lib/types/recipeDefinition.ts";

// The same sqlite file the Hub e2e webServer runs against (relative to the Hub project root, where nx runs db:reset).
const E2E_DATABASE_URL = `sqlite:${path.resolve(import.meta.dirname, "..", "..", ".data", "hub.e2e.db")}`;

// No Runner or LLM runs in Hub-only e2e, so Recipes and their Trial outcomes are inserted directly.
const DEFINITION: RecipeDefinition = {
	schemaVersion: 1,
	inputs: {},
	outputs: { status: { type: "string", description: "Outcome", required: true, nullable: false, sensitive: false } },
	steps: [
		{ id: "start", action: "open", args: ["https://example.test/"], intent: "Open the app" },
		{ id: "complete", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }], intent: "Done" }
	],
	recoveries: []
};

export interface SeededRecipe {
	id: number;
	trialJobId: number | null;
}

// `trial: "passed"` records a Completed-Success Trial Job for the Recipe, i.e. qualifies it;
// `published` publishes it (a published Recipe is what a later publish can replace).
export function seedRecipe(name: string, options: { trial?: "passed" | "failed"; published?: boolean } = {}): SeededRecipe {
	const db = openDb(E2E_DATABASE_URL);
	try {
		const { id: xrefId } = db
			.prepare("SELECT customer_application_xref.id AS id FROM customer_application_xref JOIN application ON application.id = application_id WHERE application.name = 'BambooInvoice'")
			.get() as { id: number };
		const now = new Date();
		const recipe = createDraftRecipe(db, { customerApplicationXrefId: xrefId, name, goal: "Hub e2e", definition: DEFINITION, sourceTrainingRunId: null, createdAt: now });

		let trialJobId: number | null = null;
		if (options.trial) {
			const job = insertJob(db, {
				jobType: JobType.Recipe,
				name,
				customerApplicationXrefId: xrefId,
				recipeId: recipe.id,
				mode: "Trial",
				allowlist: "https://example.test",
				stepTimeoutMs: 15_000,
				createdAt: now
			});
			updateJobStatus(db, job.id, options.trial === "passed" ? JobStatus.CompletedSuccess : JobStatus.CompletedFailed, now);
			trialJobId = job.id;
		}
		if (options.published) {
			publishRecipe(db, recipe.id, now);
		}
		return { id: recipe.id, trialJobId };
	}
	finally {
		db.close();
	}
}
