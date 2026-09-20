import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import JobPage from "./+page.svelte";

import { fetchJob } from "$lib/api/jobsApi";
import { fetchRecipes } from "$lib/api/recipesApi";
import { fetchRegisteredApplication } from "$lib/api/registeredApplicationsApi";
import { JobStatus } from "$lib/jobStatus";
import { JobType } from "$lib/jobType";
import type { JobDetail } from "$lib/types/job";

vi.mock("$app/state", () => ({ page: { params: { id: "7" } } }));
vi.mock("$lib/api/jobsApi", () => ({ fetchJob: vi.fn(), cancelJob: vi.fn() }));
vi.mock("$lib/api/recipesApi", () => ({ fetchRecipes: vi.fn() }));
vi.mock("$lib/api/registeredApplicationsApi", () => ({ fetchRegisteredApplication: vi.fn() }));

const BASE_JOB = {
	id: 7,
	customerApplicationXrefId: 3,
	jobStatusId: JobStatus.Pending,
	runnerId: null,
	createdAt: new Date("2026-09-20T00:00:00.000Z"),
	startedAt: null,
	heartbeatOn: null,
	completedAt: null,
	transcript: [],
	results: [],
	ingredients: [],
	artifacts: []
};

const RECIPE_JOB: JobDetail = {
	...BASE_JOB,
	name: "Sample recipe",
	jobType: JobType.Recipe,
	details: { recipeId: 1, mode: "Trial", allowlist: "https://example.test", stepTimeoutMs: 15000 }
};

const TRAINING_JOB: JobDetail = {
	...BASE_JOB,
	name: "Training Run",
	jobType: JobType.TrainingRun,
	details: {
		goal: "Goal",
		startingUrl: "https://example.test",
		allowlist: "https://example.test",
		maxSteps: 5,
		alternateGoals: [],
		syntheticDataConfirmed: false,
		stepTimeoutMs: 15000
	}
};

describe("Job page title", () => {
	beforeEach(() => {
		vi.mocked(fetchRegisteredApplication).mockReset().mockResolvedValue({ id: 3, customerName: "Acme", applicationName: "Widgets", runners: [] });
		vi.mocked(fetchRecipes).mockReset().mockResolvedValue([]);
	});

	it("titles a Recipe Job with its name", async () => {
		vi.mocked(fetchJob).mockReset().mockResolvedValue(RECIPE_JOB);

		render(JobPage);

		expect(await screen.findByRole("heading", { level: 1, name: "Sample recipe" })).toBeInTheDocument();
	});

	it("titles a Training Job with its name", async () => {
		vi.mocked(fetchJob).mockReset().mockResolvedValue(TRAINING_JOB);

		render(JobPage);

		expect(await screen.findByRole("heading", { level: 1, name: "Training Run" })).toBeInTheDocument();
	});
});
