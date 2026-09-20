import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import JobPage from "./+page.svelte";

import { cancelJob, endJob, fetchJob, takeControl } from "$lib/api/jobsApi";
import { fetchRecipes } from "$lib/api/recipesApi";
import { fetchRegisteredApplication } from "$lib/api/registeredApplicationsApi";
import { JobStatus } from "$lib/jobStatus";
import { TranscriptKind } from "$lib/jobTranscriptKind";
import { JobType } from "$lib/jobType";
import type { JobDetail } from "$lib/types/job";

vi.mock("$app/state", () => ({ page: { params: { id: "7" } } }));
vi.mock("$lib/api/jobsApi", () => ({ fetchJob: vi.fn(), cancelJob: vi.fn(), takeControl: vi.fn(), endJob: vi.fn() }));
vi.mock("$lib/api/recipesApi", () => ({ fetchRecipes: vi.fn() }));
vi.mock("$lib/api/registeredApplicationsApi", () => ({ fetchRegisteredApplication: vi.fn() }));
vi.mock("$lib/operatorId", () => ({ getOperatorId: () => "op-1" }));

// jsdom does not implement showModal()/close(), so polyfill them like ScreenshotOverlay's tests do.
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.setAttribute("open", "");
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.removeAttribute("open");
		this.dispatchEvent(new Event("close"));
	};
});

function recipeJob(overrides: Partial<JobDetail> & { transcriptCreatedAt?: Date } = {}): JobDetail {
	const { transcriptCreatedAt = new Date(), ...rest } = overrides;
	return {
		id: 7,
		name: "Sample recipe",
		customerApplicationXrefId: 3,
		jobType: JobType.Recipe,
		jobStatusId: JobStatus.Running,
		runnerId: 1,
		createdAt: new Date("2026-09-20T00:00:00.000Z"),
		startedAt: null,
		heartbeatOn: null,
		completedAt: null,
		interventionOwner: null,
		blockedStepId: "click_missing",
		blockedReason: "Step click_missing failed with no matching recoverable scenario",
		details: { recipeId: 1, mode: "Trial", allowlist: "https://example.test", stepTimeoutMs: 15000 },
		recipe: { schemaVersion: 1, inputs: {}, outputs: {}, steps: [], recoveries: [] },
		transcript: [{ id: 1, jobId: 7, sequence: 1, kind: TranscriptKind.Status, text: "Picked up", createdAt: transcriptCreatedAt, jobStatusId: JobStatus.Running }],
		results: [],
		ingredients: [],
		artifacts: [],
		...rest
	} as JobDetail;
}

beforeEach(() => {
	vi.mocked(fetchRegisteredApplication).mockReset().mockResolvedValue({ id: 3, customerName: "Acme", applicationName: "Widgets", runners: [] });
	vi.mocked(fetchRecipes).mockReset().mockResolvedValue([]);
	vi.mocked(fetchJob).mockReset();
	vi.mocked(takeControl).mockReset();
	vi.mocked(endJob).mockReset();
	vi.mocked(cancelJob).mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("Job page intervention controls", () => {
	it("offers Take Control and Cancel on an Intervention-Requested Recipe Job, then opens the overlay once control is taken", async () => {
		vi.mocked(fetchJob)
			.mockResolvedValueOnce(recipeJob({ jobStatusId: JobStatus.InterventionRequested }))
			.mockResolvedValue(recipeJob({ jobStatusId: JobStatus.InteractiveUser, interventionOwner: "op-1" }));
		vi.mocked(takeControl).mockResolvedValue({} as never);
		render(JobPage);

		await fireEvent.click(await screen.findByRole("button", { name: "Take Control" }));

		expect(takeControl).toHaveBeenCalledWith(7, "op-1");
		expect(await screen.findByTestId("intervention-overlay")).toBeInTheDocument();
		expect(screen.getByTestId("intervention-owner")).toHaveTextContent("Owner: you");
		expect(screen.getByRole("button", { name: "Cancel job" })).toBeInTheDocument();
	});

	it("shows the rejection and no overlay when another operator won the take", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob({ jobStatusId: JobStatus.InterventionRequested }));
		vi.mocked(takeControl).mockRejectedValue(new Error("Job 7 is not awaiting intervention or is already owned"));
		render(JobPage);

		await fireEvent.click(await screen.findByRole("button", { name: "Take Control" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("already owned");
		expect(screen.queryByTestId("intervention-overlay")).not.toBeInTheDocument();
	});

	it("opens a read-only overlay for a Job owned by another operator", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob({ jobStatusId: JobStatus.InteractiveUser, interventionOwner: "op-2" }));
		render(JobPage);

		await fireEvent.click(await screen.findByRole("button", { name: "View control panel" }));

		expect(await screen.findByTestId("intervention-readonly")).toBeInTheDocument();
		expect(screen.getByTestId("job-owner")).toHaveTextContent("Owner: op-2");
		expect(screen.queryByRole("button", { name: "Take Control" })).not.toBeInTheDocument();
	});

	it("ends the Job when the owner uses End Job in the overlay", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob({ jobStatusId: JobStatus.InteractiveUser, interventionOwner: "op-1" }));
		vi.mocked(endJob).mockResolvedValue({} as never);
		render(JobPage);

		await fireEvent.click(await screen.findByRole("button", { name: "Open control panel" }));
		await fireEvent.click(await screen.findByRole("button", { name: "End Job" }));

		expect(endJob).toHaveBeenCalledWith(7, "op-1");
	});

	it("shows the end error in the overlay when ending fails", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob({ jobStatusId: JobStatus.InteractiveUser, interventionOwner: "op-1" }));
		vi.mocked(endJob).mockRejectedValue(new Error("Job 7 is not currently owned by this operator"));
		render(JobPage);

		await fireEvent.click(await screen.findByRole("button", { name: "Open control panel" }));
		await fireEvent.click(await screen.findByRole("button", { name: "End Job" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("not currently owned");
	});

	it("does not offer Take Control or Cancel on a Running Recipe Job", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob());
		render(JobPage);

		await screen.findByRole("heading", { level: 1, name: "Sample recipe" });

		expect(screen.queryByRole("button", { name: "Take Control" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Cancel job" })).not.toBeInTheDocument();
	});

	it("closes the overlay and names the new status when a refresh shows the Job was cancelled", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		vi.mocked(fetchJob)
			.mockResolvedValueOnce(recipeJob({ jobStatusId: JobStatus.InteractiveUser, interventionOwner: "op-1" }))
			.mockResolvedValue(recipeJob({ jobStatusId: JobStatus.CompletedCancelled }));
		render(JobPage);

		await fireEvent.click(await screen.findByRole("button", { name: "Open control panel" }));
		expect(await screen.findByTestId("intervention-overlay")).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(1000);

		await waitFor(() => expect(screen.queryByTestId("intervention-overlay")).not.toBeInTheDocument());
		expect(screen.getByRole("status")).toHaveTextContent("Job is now Completed-Cancelled");
	});
});

describe("Job page refresh interval", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
	});

	async function settle() {
		await screen.findByRole("heading", { level: 1, name: "Sample recipe" });
		vi.mocked(fetchJob).mockClear();
	}

	it("refreshes after the fast interval while the Job is non-terminal", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob());
		render(JobPage);
		await settle();

		await vi.advanceTimersByTimeAsync(1000);

		expect(fetchJob).toHaveBeenCalledTimes(1);
	});

	it("waits for the slow interval once the Job is terminal", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob({ jobStatusId: JobStatus.CompletedSuccess }));
		render(JobPage);
		await settle();

		await vi.advanceTimersByTimeAsync(4900);
		expect(fetchJob).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(200);
		expect(fetchJob).toHaveBeenCalledTimes(1);
	});

	it("waits for the slow interval when the latest Transcript entry is more than 6 hours old", async () => {
		vi.mocked(fetchJob).mockResolvedValue(recipeJob({ transcriptCreatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) }));
		render(JobPage);
		await settle();

		await vi.advanceTimersByTimeAsync(4900);
		expect(fetchJob).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(200);
		expect(fetchJob).toHaveBeenCalledTimes(1);
	});

	it("switches from the fast to the slow interval after a refresh reports a terminal status", async () => {
		vi.mocked(fetchJob).mockResolvedValueOnce(recipeJob()).mockResolvedValue(recipeJob({ jobStatusId: JobStatus.CompletedSuccess }));
		render(JobPage);
		await settle();

		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchJob).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(4000);
		expect(fetchJob).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1100);
		expect(fetchJob).toHaveBeenCalledTimes(2);
	});
});
