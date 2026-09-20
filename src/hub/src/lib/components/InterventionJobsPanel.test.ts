import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import InterventionJobsPanel from "./InterventionJobsPanel.svelte";

import { JobStatus } from "$lib/jobStatus";
import { JobType } from "$lib/jobType";
import type { Job } from "$lib/types/job";

function job(id: number, jobStatusId: JobStatus, interventionOwner: string | null): Job {
	return {
		id,
		name: `Recipe ${id}`,
		customerApplicationXrefId: 3,
		jobType: JobType.Recipe,
		jobStatusId,
		runnerId: 1,
		createdAt: new Date("2026-09-20T00:00:00.000Z"),
		startedAt: null,
		heartbeatOn: null,
		completedAt: null,
		interventionOwner,
		blockedStepId: null,
		blockedReason: null,
		resumeStepId: null,
		details: { recipeId: 1, mode: "Trial", allowlist: "https://example.test", stepTimeoutMs: 15000 }
	};
}

describe("InterventionJobsPanel", () => {
	it("links each Job in an intervention status with its status and owner", () => {
		render(InterventionJobsPanel, {
			jobs: [job(1, JobStatus.InterventionRequested, null), job(2, JobStatus.InteractiveUser, "op-1"), job(3, JobStatus.Running, null)]
		});

		expect(screen.getByRole("link", { name: /Recipe 1/ })).toHaveAttribute("href", "/jobs/1");
		expect(screen.getByRole("link", { name: /Recipe 2/ })).toHaveAttribute("href", "/jobs/2");
		expect(screen.queryByRole("link", { name: /Recipe 3/ })).not.toBeInTheDocument();
		expect(screen.getByText("Intervention-Requested")).toBeInTheDocument();
		expect(screen.getByText("Interactive-User")).toBeInTheDocument();
		expect(screen.getByText("Unowned")).toBeInTheDocument();
		expect(screen.getByText("Owner: op-1")).toBeInTheDocument();
	});

	it("renders nothing when no Job needs intervention", () => {
		render(InterventionJobsPanel, { jobs: [job(3, JobStatus.Running, null)] });

		expect(screen.queryByTestId("intervention-jobs")).not.toBeInTheDocument();
	});
});
