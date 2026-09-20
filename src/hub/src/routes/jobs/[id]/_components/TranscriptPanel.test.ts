import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";

import TranscriptPanel from "./TranscriptPanel.svelte";

import { JobStatus } from "$lib/jobStatus";
import { TranscriptKind } from "$lib/jobTranscriptKind";
import { SensitivityType } from "$lib/sensitivityType";
import type { JobTranscriptEntry } from "$lib/types/job";

// jsdom recognizes <dialog> but doesn't implement showModal()/close(), so polyfill them.
beforeAll(() => {
	if (!HTMLDialogElement.prototype.showModal) {
		HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
			this.setAttribute("open", "");
		};
	}
	if (!HTMLDialogElement.prototype.close) {
		HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
			this.removeAttribute("open");
			this.dispatchEvent(new Event("close"));
		};
	}
});

describe("TranscriptPanel", () => {
	it("renders a non-Step entry's text as a plain string", () => {
		const entries: JobTranscriptEntry[] = [
			{
				id: 1,
				jobId: 1,
				sequence: -2,
				kind: TranscriptKind.Info,
				text: "Job created, queued for a Runner",
				createdAt: new Date(),
				jobStatusId: null
			}
		];

		render(TranscriptPanel, { entries, jobId: 1, artifacts: [] });

		expect(screen.getByText("Job created, queued for a Runner")).toBeInTheDocument();
	});

	it("renders a Step entry's inputs and outputs as labeled rows, masking sensitive fields", () => {
		const entries: JobTranscriptEntry[] = [
			{
				id: 2,
				jobId: 1,
				sequence: 1,
				kind: TranscriptKind.Step,
				text: {
					stepId: "fill_invoice",
					outcome: "succeeded",
					action: "fill",
					targetDescription: { component: "text input", selector: "label='Customer'" },
					inputs: [{ fieldName: "customerName", safeValue: "Northwind", sensitivityType: SensitivityType.None }],
					outputs: [{ fieldName: "ssn", safeValue: "••••••", sensitivityType: SensitivityType.PII }]
				},
				createdAt: new Date(),
				jobStatusId: null
			}
		];

		render(TranscriptPanel, { entries, jobId: 1, artifacts: [] });

		expect(screen.getByText("fill_invoice: fill on text input(label='Customer')")).toBeInTheDocument();
		expect(screen.getByText("input: customerName")).toBeInTheDocument();
		expect(screen.getByText("Northwind")).toBeInTheDocument();
		expect(screen.getByText("output: ssn")).toBeInTheDocument();
		expect(screen.getByText("••••••")).toBeInTheDocument();
	});

	it("drops the selector parentheses when the Step's target has no selector", () => {
		const entries: JobTranscriptEntry[] = [
			{
				id: 3,
				jobId: 1,
				sequence: 1,
				kind: TranscriptKind.Step,
				text: { stepId: "open_home", outcome: "succeeded", action: "open", targetDescription: { component: "element", selector: "" }, inputs: [], outputs: [] },
				createdAt: new Date(),
				jobStatusId: null
			}
		];

		render(TranscriptPanel, { entries, jobId: 1, artifacts: [] });

		expect(screen.getByText("open_home: open on element")).toBeInTheDocument();
	});

	it.each([
		[JobStatus.InterventionRequested, "intervention"],
		[JobStatus.CompletedSuccess, "success"],
		[JobStatus.CompletedFailed, "failed"],
		[JobStatus.CompletedError, "error"]
	])("styles the row and rail for status %s with the %s variant", (jobStatusId, variant) => {
		const entries: JobTranscriptEntry[] = [
			{ id: 1, jobId: 1, sequence: 1, kind: TranscriptKind.Status, text: "Status changed", createdAt: new Date(), jobStatusId }
		];

		const { container } = render(TranscriptPanel, { entries, jobId: 1, artifacts: [] });

		expect(container.querySelector(`.transcript-rail-${variant}`)).not.toBeNull();
		expect(container.querySelector(`.transcript-row-${variant}`)).not.toBeNull();
	});

	it("shows a screenshot icon on a Step row with an artifact and opens the overlay with that image", async () => {
		const entries: JobTranscriptEntry[] = [
			{
				id: 3,
				jobId: 7,
				sequence: 1,
				kind: TranscriptKind.Step,
				text: { stepId: "open_home", outcome: "succeeded", action: "open", targetDescription: { component: "element", selector: "" }, inputs: [], outputs: [] },
				createdAt: new Date(),
				jobStatusId: null
			}
		];
		const artifacts = [
			{ id: 4, stepId: "open_home", createdAt: new Date() },
			{ id: 5, stepId: "open_home", createdAt: new Date() }
		];

		render(TranscriptPanel, { entries, jobId: 7, artifacts });
		await fireEvent.click(screen.getByRole("button", { name: "View screenshot for open_home" }));

		expect((screen.getByRole("img") as HTMLImageElement).src).toContain("/api/hub/jobs/7/artifacts/5");
	});

	it("shows no screenshot icon on a Step row without an artifact", () => {
		const entries: JobTranscriptEntry[] = [
			{
				id: 3,
				jobId: 7,
				sequence: 1,
				kind: TranscriptKind.Step,
				text: { stepId: "open_home", outcome: "succeeded", action: "open", targetDescription: { component: "element", selector: "" }, inputs: [], outputs: [] },
				createdAt: new Date(),
				jobStatusId: null
			}
		];

		render(TranscriptPanel, { entries, jobId: 7, artifacts: [{ id: 4, stepId: "other", createdAt: new Date() }] });

		expect(screen.queryByRole("button", { name: /view screenshot/i })).not.toBeInTheDocument();
	});
});
