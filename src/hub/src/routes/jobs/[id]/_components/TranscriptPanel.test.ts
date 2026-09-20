import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";

import TranscriptPanel from "./TranscriptPanel.svelte";

import { JobStatus } from "$lib/jobStatus";
import { TranscriptKind } from "$lib/jobTranscriptKind";
import { SensitivityType } from "$lib/sensitivityType";
import type { JobStepArtifact, JobTranscriptEntry, StepTranscriptText } from "$lib/types/job";
import type { Recovery, Step } from "$lib/types/recipeDefinition";

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

const openStep = (id: string, intent?: string): Step => ({ id, action: "open", args: ["https://example.test"], ...(intent && { intent }) });

function stepEntry(sequence: number, text: Partial<StepTranscriptText> & { stepId: string }): JobTranscriptEntry {
	return {
		id: sequence,
		jobId: 1,
		sequence,
		kind: TranscriptKind.Step,
		text: { outcome: "succeeded", action: "open", targetDescription: { component: "browser", selector: "" }, inputs: [], outputs: [], ...text },
		createdAt: new Date(),
		jobStatusId: null
	};
}

function props(entries: JobTranscriptEntry[], steps: Step[] = [], recoveries: Recovery[] = [], artifacts: JobStepArtifact[] = []) {
	return { entries, jobId: 1, artifacts, steps, recoveries };
}

describe("TranscriptPanel", () => {
	it("renders an operator command Step from its observed target, since no Recipe Step defines it", async () => {
		const entry = stepEntry(1, { stepId: "intervention-3", action: "click", targetDescription: { component: "browser", selector: "" } });
		render(TranscriptPanel, props([entry], [openStep("open_home")]));

		expect(screen.getByText("intervention-3: click on browser")).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "Toggle details for intervention-3" }));
		expect(screen.queryByText("recipe step:")).not.toBeInTheDocument();
		expect(screen.getByText(/observed:/)).toBeInTheDocument();
	});

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

		render(TranscriptPanel, props(entries));

		expect(screen.getByText("Job created, queued for a Runner")).toBeInTheDocument();
	});

	it("renders a Step entry's inputs and outputs as labeled rows, masking sensitive fields", () => {
		const entries = [
			stepEntry(1, {
				stepId: "fill_invoice",
				action: "fill",
				targetDescription: { component: "text input", selector: "label='Customer'" },
				inputs: [{ fieldName: "customerName", safeValue: "Northwind", sensitivityType: SensitivityType.None }],
				outputs: [{ fieldName: "ssn", safeValue: "••••••", sensitivityType: SensitivityType.PII }]
			})
		];

		render(TranscriptPanel, props(entries, [openStep("fill_invoice")]));

		expect(screen.getByText("fill_invoice: fill on text input(label='Customer')")).toBeInTheDocument();
		expect(screen.getByText("input: customerName")).toBeInTheDocument();
		expect(screen.getByText("Northwind")).toBeInTheDocument();
		expect(screen.getByText("output: ssn")).toBeInTheDocument();
		expect(screen.getByText("••••••")).toBeInTheDocument();
	});

	it("drops the selector parentheses when the Step's target has no selector", () => {
		render(TranscriptPanel, props([stepEntry(1, { stepId: "open_home" })], [openStep("open_home")]));

		expect(screen.getByText("open_home: navigate to URL")).toBeInTheDocument();
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

		const { container } = render(TranscriptPanel, props(entries));

		expect(container.querySelector(`.transcript-rail-${variant}`)).not.toBeNull();
		expect(container.querySelector(`.transcript-row-${variant}`)).not.toBeNull();
	});

	it("shows a screenshot icon on a Step row with an artifact and opens the overlay with that image", async () => {
		const artifacts = [
			{ id: 4, stepId: "open_home", createdAt: new Date() },
			{ id: 5, stepId: "open_home", createdAt: new Date() }
		];

		render(TranscriptPanel, { ...props([stepEntry(1, { stepId: "open_home" })], [openStep("open_home")], [], artifacts), jobId: 7 });
		await fireEvent.click(screen.getByRole("button", { name: "View screenshot for open_home" }));

		expect((screen.getByRole("img") as HTMLImageElement).src).toContain("/api/hub/jobs/7/artifacts/5");
	});

	it("shows no screenshot icon on a Step row without an artifact", () => {
		const artifacts = [{ id: 4, stepId: "other", createdAt: new Date() }];

		render(TranscriptPanel, props([stepEntry(1, { stepId: "open_home" })], [openStep("open_home")], [], artifacts));

		expect(screen.queryByRole("button", { name: /view screenshot/i })).not.toBeInTheDocument();
	});

	it("shows the Step's intent instead of the generated message, falling back to the message without one", () => {
		const entries = [stepEntry(1, { stepId: "with_intent" }), stepEntry(2, { stepId: "no_intent" })];

		render(TranscriptPanel, props(entries, [openStep("with_intent", "Open the home page"), openStep("no_intent")]));

		expect(screen.getByText("Open the home page")).toBeInTheDocument();
		expect(screen.getByText("no_intent: navigate to URL")).toBeInTheDocument();
	});

	it("orders cells time, kind, text, status badge, screenshot button, toggle", () => {
		const artifacts = [{ id: 4, stepId: "open_home", createdAt: new Date() }];
		const entry = { ...stepEntry(1, { stepId: "open_home" }), jobStatusId: JobStatus.CompletedSuccess };

		const { container } = render(TranscriptPanel, props([entry], [openStep("open_home")], [], artifacts));

		const classes = Array.from(container.querySelector(".transcript-row")!.children).map((cell) => cell.className);
		const positions = ["transcript-time", "transcript-kind-step", "transcript-text", "badge", "transcript-screenshot-cell", "transcript-toggle-cell"]
			.map((name) => classes.findIndex((value) => value.includes(name)));
		expect(positions).not.toContain(-1);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	it("keeps the screenshot and toggle columns on non-Step rows as placeholders with no buttons", () => {
		const entries: JobTranscriptEntry[] = [
			{ id: 1, jobId: 1, sequence: 1, kind: TranscriptKind.Info, text: "Job created", createdAt: new Date(), jobStatusId: null }
		];

		const { container } = render(TranscriptPanel, props(entries));

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(container.querySelectorAll(".transcript-row > .transcript-screenshot-cell, .transcript-row > .transcript-toggle-cell")).toHaveLength(2);
	});

	it("expands a Step row to show id, outcome, the recipe step and the observed message, and collapses again", async () => {
		const entries = [stepEntry(1, { stepId: "open_home", outcome: "failed" })];

		render(TranscriptPanel, props(entries, [openStep("open_home", "Open home")]));
		expect(screen.queryByText("id: open_home")).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole("button", { name: "Toggle details for open_home" }));

		expect(screen.getByText("id: open_home")).toBeInTheDocument();
		expect(screen.getByText("outcome: failed")).toBeInTheDocument();
		expect(screen.getByText("recipe step:")).toBeInTheDocument();
		expect(screen.getByTestId("step-description")).toHaveTextContent("open");
		expect(screen.getByText("observed:")).toBeInTheDocument();
		expect(screen.getByText("navigate to URL")).toBeInTheDocument();

		await fireEvent.click(screen.getByRole("button", { name: "Toggle details for open_home" }));

		expect(screen.queryByText("id: open_home")).not.toBeInTheDocument();
	});

	it("keeps a row expanded when the entries refresh", async () => {
		const { rerender } = render(TranscriptPanel, props([stepEntry(1, { stepId: "open_home" })], [openStep("open_home")]));
		await fireEvent.click(screen.getByRole("button", { name: "Toggle details for open_home" }));

		await rerender(props([stepEntry(1, { stepId: "open_home" }), stepEntry(2, { stepId: "open_home" })], [openStep("open_home")]));

		expect(screen.getAllByText("id: open_home")).toHaveLength(1);
	});

	it("finds a Step nested in a group, an if branch, and a recovery", async () => {
		const target = { by: "text", value: "x" } as const;
		const steps: Step[] = [
			{ id: "wrapper", action: "group", args: [[{ id: "in_group", action: "goto", args: ["done"] }]] },
			{ id: "branch", action: "if", args: [[{ when: { test: "exists", args: [target] }, steps: [{ id: "in_case", action: "scroll", args: [0, 1] }] }], [{ id: "in_else", action: "scroll", args: [0, 2] }]] }
		];
		const recoveries: Recovery[] = [{ id: "r1", description: "d", when: { test: "exists", args: [target] }, steps: [{ id: "in_recovery", action: "scroll", args: [0, 3] }] }];
		const ids = ["in_group", "in_case", "in_else", "in_recovery"];

		render(TranscriptPanel, props(ids.map((stepId, index) => stepEntry(index + 1, { stepId })), steps, recoveries));
		for (const id of ids) {
			await fireEvent.click(screen.getByRole("button", { name: `Toggle details for ${id}` }));
		}

		expect(screen.getAllByText(/^id: /)).toHaveLength(4);
	});

	it("throws when a Step row's id is not in the definition", () => {
		expect(() => render(TranscriptPanel, props([stepEntry(1, { stepId: "missing" })], [openStep("other")]))).toThrow(/missing/);
	});
});
