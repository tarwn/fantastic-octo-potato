import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
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

function renderOverlay(
	overrides: {
		job?: JobDetail;
		operatorId?: string;
		onClose?: (notice: string | null) => void;
		onEndJob?: () => void;
		onHandBack?: (resumeStepId: string) => void;
		onClickCommand?: (x: number, y: number) => Promise<number>;
		onAssignCommand?: (name: string, value: string) => Promise<number>;
		onPromptCommand?: (prompt: string) => Promise<number>;
	} = {}
) {
	return render(InterventionOverlay, {
		job: overrides.job ?? JOB,
		operatorId: overrides.operatorId ?? "op-1",
		endError: null,
		onClickCommand: overrides.onClickCommand ?? vi.fn().mockResolvedValue(1),
		onAssignCommand: overrides.onAssignCommand ?? vi.fn().mockResolvedValue(1),
		onPromptCommand: overrides.onPromptCommand ?? vi.fn().mockResolvedValue(1),
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

	describe("click command", () => {
		// The preview is shown at half size (200x100 on screen for a 400x200 image).
		function showScaledScreenshot(): HTMLElement {
			const target = screen.getByTestId("screenshot-target");
			Object.defineProperty(screen.getByRole("img"), "naturalWidth", { value: 400 });
			Object.defineProperty(screen.getByRole("img"), "naturalHeight", { value: 200 });
			target.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect;
			return target;
		}

		const doneEntry = (stepId: string): JobDetail["transcript"][number] => ({
			id: 2,
			jobId: 7,
			sequence: 2,
			kind: TranscriptKind.Step,
			text: { stepId, action: "click", outcome: "succeeded", targetDescription: { component: "element", selector: "" }, inputs: [], outputs: [] },
			createdAt: new Date(),
			jobStatusId: null
		});

		it("submits a click as full-size image pixels, not preview pixels", async () => {
			const onClickCommand = vi.fn().mockResolvedValue(5);
			renderOverlay({ onClickCommand });
			const target = showScaledScreenshot();

			await fireEvent.click(target, { clientX: 60, clientY: 45 });

			expect(onClickCommand).toHaveBeenCalledWith(100, 50);
		});

		it("shows a loading indicator and blocks input until the command's Transcript entry and screenshot both arrive", async () => {
			const onClickCommand = vi.fn().mockResolvedValue(5);
			const { rerender } = renderOverlay({ onClickCommand });
			await fireEvent.click(showScaledScreenshot(), { clientX: 60, clientY: 45 });

			expect(await screen.findByTestId("command-loading")).toBeInTheDocument();
			expect(screen.getByTestId("screenshot-target")).toBeDisabled();
			expect(screen.getByRole("button", { name: "Hand Back" })).toBeDisabled();
			expect(screen.getByRole("button", { name: "End Job" })).toBeDisabled();

			await rerender({ job: { ...JOB, transcript: [...JOB.transcript, doneEntry("intervention-5")] } });
			expect(screen.getByTestId("command-loading")).toBeInTheDocument();

			await rerender({
				job: { ...JOB, transcript: [...JOB.transcript, doneEntry("intervention-5")], artifacts: [...JOB.artifacts, { id: 12, stepId: "intervention-5", createdAt: new Date() }] }
			});
			expect(screen.queryByTestId("command-loading")).not.toBeInTheDocument();
			expect(screen.getByTestId("screenshot-target")).toBeEnabled();
			expect((screen.getByRole("img") as HTMLImageElement).src).toContain("/api/hub/jobs/7/artifacts/12");
		});

		it("shows the error and stays unblocked when Hub rejects the command", async () => {
			renderOverlay({ onClickCommand: vi.fn().mockRejectedValue(new Error("Job 7 already has a command pending")) });

			await fireEvent.click(showScaledScreenshot(), { clientX: 60, clientY: 45 });

			expect(await screen.findByTestId("command-error")).toHaveTextContent("Job 7 already has a command pending");
			expect(screen.queryByTestId("command-loading")).not.toBeInTheDocument();
		});

		it("falls back to a generic message when the failure is not an Error", async () => {
			renderOverlay({ onClickCommand: vi.fn().mockRejectedValue("nope") });

			await fireEvent.click(showScaledScreenshot(), { clientX: 60, clientY: 45 });

			expect(await screen.findByTestId("command-error")).toHaveTextContent("Failed to send command");
		});

		it("does not make the screenshot clickable for a non-owner", () => {
			renderOverlay({ operatorId: "op-2" });

			expect(screen.queryByTestId("screenshot-target")).not.toBeInTheDocument();
			expect(screen.getByRole("img")).toBeInTheDocument();
		});
	});

	describe("assign command", () => {
		const enter = (text: string) => fireEvent.input(screen.getByTestId("assign-input"), { target: { value: text } });

		it("submits name=value split at the first equals sign, then clears the input and shows the loading state", async () => {
			const onAssignCommand = vi.fn().mockResolvedValue(6);
			renderOverlay({ onAssignCommand });
			await enter("note=a=b");

			await fireEvent.click(screen.getByRole("button", { name: "Assign" }));

			expect(onAssignCommand).toHaveBeenCalledWith("note", "a=b");
			expect(await screen.findByTestId("command-loading")).toBeInTheDocument();
			expect(screen.getByTestId("assign-input")).toHaveValue("");
			expect(screen.getByTestId("assign-input")).toBeDisabled();
		});

		it("rejects input without name=value locally and sends nothing", async () => {
			const onAssignCommand = vi.fn();
			renderOverlay({ onAssignCommand });
			await enter("justaname");

			await fireEvent.click(screen.getByRole("button", { name: "Assign" }));

			expect(screen.getByTestId("command-error")).toHaveTextContent("name=value");
			expect(onAssignCommand).not.toHaveBeenCalled();
		});

		it("shows Hub's rejection and keeps the typed text", async () => {
			renderOverlay({ onAssignCommand: vi.fn().mockRejectedValue(new Error("nope is not an output declared by this Recipe")) });
			await enter("nope=1");

			await fireEvent.click(screen.getByRole("button", { name: "Assign" }));

			expect(await screen.findByTestId("command-error")).toHaveTextContent("not an output declared");
			expect(screen.getByTestId("assign-input")).toHaveValue("nope=1");
		});

		it("offers no assign input to a non-owner", () => {
			renderOverlay({ operatorId: "op-2" });

			expect(screen.queryByTestId("assign-input")).not.toBeInTheDocument();
		});
	});

	describe("prompt command", () => {
		const enter = (text: string) => fireEvent.input(screen.getByTestId("prompt-input"), { target: { value: text } });

		it("submits the prompt, blocks input while it converts, then clears it and shows the loading state", async () => {
			let resolveSend: (id: number) => void = () => {};
			const onPromptCommand = vi.fn().mockReturnValue(new Promise<number>((resolve) => (resolveSend = resolve)));
			renderOverlay({ onPromptCommand });
			await enter("Click the Save button");

			await fireEvent.click(screen.getByRole("button", { name: "Prompt" }));

			expect(onPromptCommand).toHaveBeenCalledWith("Click the Save button");
			expect(screen.getByTestId("prompt-input")).toBeDisabled();
			resolveSend(4);
			expect(await screen.findByTestId("command-loading")).toBeInTheDocument();
			await waitFor(() => expect(screen.getByTestId("prompt-input")).toHaveValue(""));
		});

		it("shows Hub's rejection and keeps the typed text", async () => {
			renderOverlay({ onPromptCommand: vi.fn().mockRejectedValue(new Error("LLM did not return a valid next Step")) });
			await enter("Do something odd");

			await fireEvent.click(screen.getByRole("button", { name: "Prompt" }));

			expect(await screen.findByTestId("command-error")).toHaveTextContent("did not return a valid");
			expect(screen.getByTestId("prompt-input")).toHaveValue("Do something odd");
			expect(screen.getByTestId("prompt-input")).not.toBeDisabled();
		});

		it("offers no prompt input to a non-owner", () => {
			renderOverlay({ operatorId: "op-2" });

			expect(screen.queryByTestId("prompt-input")).not.toBeInTheDocument();
		});
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
