import { describe, expect, it } from "vitest";

import type { JobDetail } from "./types/job";
import type { RecipeDefinition, Step } from "./types/recipeDefinition";
import { buildJobExport } from "./jobExport";
import { JobStatus } from "./jobStatus";
import { JobType } from "./jobType";
import { SensitivityType } from "./sensitivityType";

const BASE = {
	id: 7,
	name: "Job",
	customerApplicationXrefId: 3,
	jobStatusId: JobStatus.Pending,
	runnerId: null,
	createdAt: new Date("2026-09-20T00:00:00.000Z"),
	startedAt: null,
	heartbeatOn: null,
	completedAt: null,
	transcript: [],
	results: [],
	ingredients: [{ fieldName: "password", safeValue: "***", sensitivityType: SensitivityType.Other }],
	artifacts: []
};

describe("buildJobExport", () => {
	it("pairs a Recipe Job's definition with its transcript", () => {
		const recipe: RecipeDefinition = { schemaVersion: 1, inputs: {}, outputs: {}, steps: [], recoveries: [] };
		const job: JobDetail = {
			...BASE,
			jobType: JobType.Recipe,
			details: { recipeId: 1, mode: "Trial", allowlist: "https://example.test", stepTimeoutMs: 15000 },
			recipe
		};

		expect(buildJobExport(job)).toEqual({ recipe, transcript: job });
	});

	it("pairs a Training Run's saved Steps and ingredients with its transcript", () => {
		const steps: Step[] = [{ id: "open_home", action: "open", args: ["https://example.test"] }];
		const job: JobDetail = {
			...BASE,
			jobType: JobType.TrainingRun,
			details: {
				goal: "Goal",
				startingUrl: "https://example.test",
				allowlist: "https://example.test",
				maxSteps: 5,
				alternateGoals: [],
				syntheticDataConfirmed: false,
				stepTimeoutMs: 15000
			},
			steps
		};

		expect(buildJobExport(job)).toEqual({ run: { steps, ingredients: BASE.ingredients }, transcript: job });
	});
});
