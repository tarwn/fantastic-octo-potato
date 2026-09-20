import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import JobsPage from "./+page.svelte";

import { fetchJobs } from "$lib/api/jobsApi";
import { fetchRegisteredApplications } from "$lib/api/registeredApplicationsApi";
import { JobStatus } from "$lib/jobStatus";
import { JobType } from "$lib/jobType";
import type { Job } from "$lib/types/job";

vi.mock("$lib/api/jobsApi", () => ({ fetchJobs: vi.fn() }));
vi.mock("$lib/api/registeredApplicationsApi", () => ({ fetchRegisteredApplications: vi.fn() }));

const RECIPE_JOB: Job = {
	id: 7,
	name: "Sample recipe",
	customerApplicationXrefId: 3,
	jobType: JobType.Recipe,
	jobStatusId: JobStatus.Pending,
	runnerId: null,
	createdAt: new Date("2026-09-20T00:00:00.000Z"),
	startedAt: null,
	heartbeatOn: null,
	completedAt: null,
	interventionOwner: null,
	blockedStepId: null,
	blockedReason: null,
	resumeStepId: null,
	details: { recipeId: 1, mode: "Execute", allowlist: "https://example.test", stepTimeoutMs: 15000 }
};

describe("Jobs page", () => {
	beforeEach(() => {
		vi.mocked(fetchRegisteredApplications).mockReset().mockResolvedValue([{ id: 3, customerName: "Acme", applicationName: "Widgets" }]);
	});

	it("shows each Job's name next to its id", async () => {
		vi.mocked(fetchJobs).mockReset().mockResolvedValue([RECIPE_JOB]);

		render(JobsPage);

		expect(await screen.findByText("Sample recipe")).toBeInTheDocument();
		expect(screen.getByText("job-ca3-7")).toBeInTheDocument();
	});

	it("escapes a Job name that looks like markup", async () => {
		vi.mocked(fetchJobs)
			.mockReset()
			.mockResolvedValue([{ ...RECIPE_JOB, name: "<b>bold</b>" }]);

		render(JobsPage);

		await waitFor(() => expect(screen.getByText("<b>bold</b>")).toBeInTheDocument());
	});
});
