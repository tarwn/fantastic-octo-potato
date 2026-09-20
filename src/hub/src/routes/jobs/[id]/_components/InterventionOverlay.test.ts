import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it, vi } from "vitest";

import InterventionOverlay from "./InterventionOverlay.svelte";

import { JobStatus } from "$lib/jobStatus";
import { TranscriptKind } from "$lib/jobTranscriptKind";
import { JobType } from "$lib/jobType";
import type { JobDetail } from "$lib/types/job";

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

const JOB: JobDetail = {
	id: 7,
	name: "Sample recipe",
	customerApplicationXrefId: 3,
	jobType: JobType.Recipe,
	jobStatusId: JobStatus.InteractiveUser,
	runnerId: 1,
	createdAt: new Date("2026-09-20T00:00:00.000Z"),
	startedAt: null,
	heartbeatOn: null,
	completedAt: null,
	interventionOwner: "op-1",
	blockedStepId: "click_missing",
	blockedReason: "Step click_missing failed with no matching recoverable scenario",
	resumeStepId: null,
	details: { recipeId: 1, mode: "Trial", allowlist: "https://example.test", stepTimeoutMs: 15000 },
	recipe: {
		schemaVersion: 1,
		inputs: {},
		outputs: {},
		steps: [
			{ id: "open_home", action: "open", args: ["https://example.test"] },
			{ id: "click_missing", action: "click", args: [{ by: "text", value: "Missing" }] },
			{ id: "finish_up", action: "finish", args: [null] }
		],
		recoveries: []
	},
	transcript: [
		{ id: 1, jobId: 7, sequence: 1, kind: TranscriptKind.Status, text: "Control taken by operator op-1", createdAt: new Date(), jobStatusId: JobStatus.InteractiveUser }
	],
	results: [],
	ingredients: [],
	artifacts: [
		{ id: 4, stepId: "open_home", createdAt: new Date() },
		{ id: 9, stepId: "click_missing", createdAt: new Date() }
	]
};

function renderOverlay(overrides: { job?: JobDetail; operatorId?: string; onClose?: (notice: string | null) => void; onEndJob?: () => void; onHandBack?: (resumeStepId: string) => void } = {}) {
	return render(InterventionOverlay, {
		job: overrides.job ?? JOB,
		operatorId: overrides.operatorId ?? "op-1",
		endError: null,
		onEndJob: overrides.onEndJob ?? vi.fn(),
		onHandBack: overrides.onHandBack ?? vi.fn(),
		onClose: overrides.onClose ?? vi.fn()
	});
}

describe("InterventionOverlay", () => {
	it("shows the latest screenshot, blocked step and reason, recent transcript, owner and status", () => {
		renderOverlay();

		expect((screen.getByRole("img") as HTMLImageElement).src).toContain("/api/hub/jobs/7/artifacts/9");
		expect(screen.getByTestId("intervention-blocked")).toHaveTextContent("Blocked at step click_missing: Step click_missing failed with no matching recoverable scenario");
		expect(screen.getByRole("list", { name: "Recent transcript" })).toHaveTextContent("Control taken by operator op-1");
		expect(screen.getByTestId("intervention-owner")).toHaveTextContent("Owner: you");
		expect(screen.getByText("Interactive-User")).toBeInTheDocument();
	});

	it("says there is no screenshot when none has been uploaded", () => {
		renderOverlay({ job: { ...JOB, artifacts: [] } });

		expect(screen.getByText("No screenshot yet.")).toBeInTheDocument();
	});

	it("lets the owner end the Job", async () => {
		const onEndJob = vi.fn();
		renderOverlay({ onEndJob });

		await fireEvent.click(screen.getByRole("button", { name: "End Job" }));

		expect(onEndJob).toHaveBeenCalledOnce();
		expect(screen.queryByTestId("intervention-readonly")).not.toBeInTheDocument();
	});

	it("hands back at the blocked Step by default", async () => {
		const onHandBack = vi.fn();
		renderOverlay({ onHandBack });

		expect((screen.getByTestId("resume-step") as HTMLSelectElement).value).toBe("click_missing");
		await fireEvent.click(screen.getByRole("button", { name: "Hand Back" }));

		expect(onHandBack).toHaveBeenCalledWith("click_missing");
	});

	it("defaults the resume Step to the first option when the blocked Step is not resumable", () => {
		renderOverlay({ job: { ...JOB, blockedStepId: "recovery_step" } });

		expect((screen.getByTestId("resume-step") as HTMLSelectElement).value).toBe("open_home");
	});

	it("hands back at the Step the owner selects", async () => {
		const onHandBack = vi.fn();
		renderOverlay({ onHandBack });

		await fireEvent.change(screen.getByTestId("resume-step"), { target: { value: "finish_up" } });
		await fireEvent.click(screen.getByRole("button", { name: "Hand Back" }));

		expect(onHandBack).toHaveBeenCalledWith("finish_up");
	});

	it("locks the actions while a hand-back is waiting for the Runner", () => {
		renderOverlay({ job: { ...JOB, resumeStepId: "finish_up" } });

		expect(screen.getByRole("button", { name: "Handing back…" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "End Job" })).toBeDisabled();
		expect(screen.getByTestId("resume-step")).toBeDisabled();
	});

	it("offers no hand back to a non-owner", () => {
		renderOverlay({ operatorId: "op-2" });

		expect(screen.queryByRole("button", { name: "Hand Back" })).not.toBeInTheDocument();
	});

	it("is read-only for a viewer who is not the owner", () => {
		renderOverlay({ operatorId: "op-2" });

		expect(screen.getByTestId("intervention-readonly")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "End Job" })).not.toBeInTheDocument();
		expect(screen.getByTestId("intervention-owner")).toHaveTextContent("Owner: op-1");
	});

	it("closes without a notice when the operator closes it", async () => {
		const onClose = vi.fn();
		renderOverlay({ onClose });

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(onClose).toHaveBeenCalledWith(null);
	});

	it.each([
		[JobStatus.CompletedFailed, "Job is now Completed-Failed"],
		[JobStatus.CompletedCancelled, "Job is now Completed-Cancelled"],
		[JobStatus.CompletedError, "Job is now Completed-Error"],
		[JobStatus.Running, "Job is now Running"],
		[JobStatus.InterventionRequested, "Job is now Intervention-Requested"]
	])("auto-closes with the new status when the Job moves to %s", async (status, notice) => {
		const onClose = vi.fn();
		const { rerender } = renderOverlay({ onClose });
		onClose.mockClear();

		await rerender({ job: { ...JOB, jobStatusId: status, interventionOwner: null } });

		expect(onClose).toHaveBeenCalledWith(notice);
	});

	it("auto-closes naming the new owner when ownership moves", async () => {
		const onClose = vi.fn();
		const { rerender } = renderOverlay({ onClose });
		onClose.mockClear();

		await rerender({ job: { ...JOB, interventionOwner: "op-2" } });

		expect(onClose).toHaveBeenCalledWith("Control moved to operator op-2");
	});
});
