import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./db/_test/integrationTestDb";
import { JobType } from "./db/jobType";
import { insertJob } from "./repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "./repositories/recipeRepository";
import { getJobStepArtifactImage } from "./jobActions";
import { runnerPoll, uploadJobStepArtifact } from "./runnerActions";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

const SHARED_SECRET = "test-secret";

function seedRunner(db: Database.Database): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'BambooInvoice');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
	`);
	return 1;
}

const sampleDefinition: RecipeDefinition = {
	schemaVersion: 1,
	inputs: {},
	outputs: {},
	steps: [{ id: "start", action: "open", args: ["https://example.test"] }],
	recoveries: []
};

async function createRunningRecipeJobAndUploadArtifact(
	db: Database.Database,
	runnerId: number,
	image: Buffer
): Promise<{ jobId: number; artifactId: number }> {
	const draft = createDraftRecipe(db, {
		customerApplicationXrefId: 1,
		name: "Sample recipe",
		goal: "Goal",
		definition: sampleDefinition,
		sourceTrainingRunId: null,
		createdAt: new Date("2026-09-15T00:00:00.000Z")
	});
	const recipe = publishRecipe(db, draft.id, new Date("2026-09-15T00:00:01.000Z"))!;
	const job = insertJob(db, {
		jobType: JobType.Recipe,
		customerApplicationXrefId: 1,
		recipeId: recipe.id,
		mode: "Execute",
		allowlist: "https://example.test",
		stepTimeoutMs: 15_000,
		createdAt: new Date("2026-09-15T00:00:02.000Z")
	});
	await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
	const uploadResult = uploadJobStepArtifact(db, String(runnerId), String(job.id), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
		stepId: "start",
		imageBase64: image.toString("base64")
	});
	const artifactId = (uploadResult.body as { data: { id: number } }).data.id;
	return { jobId: job.id, artifactId };
}

describe("getJobStepArtifactImage", () => {
	const getDb = useIntegrationTestDb();

	it("serves back exactly the bytes the Runner uploaded", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const image = Buffer.from("served-back-bytes");
		const { jobId, artifactId } = await createRunningRecipeJobAndUploadArtifact(db, runnerId, image);

		const result = getJobStepArtifactImage(db, String(jobId), String(artifactId));

		expect(result?.image).toEqual(image);
	});

	it("returns undefined for a nonexistent artifact id", () => {
		const db = getDb();
		expect(getJobStepArtifactImage(db, "999", "999")).toBeUndefined();
	});

	it("returns undefined when the artifact exists but belongs to a different Job", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId: firstJobId, artifactId } = await createRunningRecipeJobAndUploadArtifact(db, runnerId, Buffer.from("job-one-bytes"));
		const { jobId: secondJobId } = await createRunningRecipeJobAndUploadArtifact(db, runnerId, Buffer.from("job-two-bytes"));

		expect(secondJobId).not.toBe(firstJobId);
		expect(getJobStepArtifactImage(db, String(secondJobId), String(artifactId))).toBeUndefined();
	});
});
