import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import TranscriptPanel from "./TranscriptPanel.svelte";

import { JobStatus } from "$lib/jobStatus";
import { TranscriptKind } from "$lib/jobTranscriptKind";
import { SensitivityType } from "$lib/sensitivityType";
import type { JobTranscriptEntry } from "$lib/types/job";

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

		render(TranscriptPanel, { entries });

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

		render(TranscriptPanel, { entries });

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

		render(TranscriptPanel, { entries });

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

		const { container } = render(TranscriptPanel, { entries });

		expect(container.querySelector(`.transcript-rail-${variant}`)).not.toBeNull();
		expect(container.querySelector(`.transcript-row-${variant}`)).not.toBeNull();
	});
});
