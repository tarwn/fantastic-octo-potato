import { describe, expect, it } from "vitest";

import { TranscriptKind } from "../storage/db/jobTranscriptKind";
import type { JobTranscriptEntry, TrainingRunJobStep } from "../storage/repositories/jobRepository";

import { buildJournal, summarizeTranscriptForLlm } from "./transcriptSummary";

function entry(overrides: Partial<JobTranscriptEntry> & Pick<JobTranscriptEntry, "kind" | "text">): JobTranscriptEntry {
	return { id: 1, jobId: 1, sequence: 1, createdAt: new Date("2026-09-15T00:00:00.000Z"), jobStatusId: null, ...overrides } as JobTranscriptEntry;
}

describe("summarizeTranscriptForLlm", () => {
	it("renders a Step entry with its extracted outputs", () => {
		const summary = summarizeTranscriptForLlm([
			entry({ kind: TranscriptKind.Step, text: { stepId: "click_search", outcome: "succeeded", targetDescription: { component: "button", selector: "" }, inputs: [], outputs: [] } })
		]);

		expect(summary).toBe("Step: click_search: succeeded");
	});

	it("includes extracted output field names and safe values", () => {
		const summary = summarizeTranscriptForLlm([
			entry({
				kind: TranscriptKind.Step,
				text: {
					stepId: "read_total",
					outcome: "succeeded",
					targetDescription: { component: "element", selector: "" },
					inputs: [],
					outputs: [{ fieldName: "total", safeValue: "42", sensitivityType: 1 }]
				}
			})
		]);

		expect(summary).toBe("Step: read_total: succeeded (extracted: total=42)");
	});

	it("omits Status entries, since they duplicate Job status already known to the caller", () => {
		const summary = summarizeTranscriptForLlm([entry({ kind: TranscriptKind.Status, text: "Picked up by Runner 1" })]);

		expect(summary).toBe("");
	});

	it("renders a non-Step, non-Status entry with its kind name", () => {
		const summary = summarizeTranscriptForLlm([entry({ kind: TranscriptKind.Observe, text: "Page shows no results" })]);

		expect(summary).toBe("Observe: Page shows no results");
	});
});

describe("buildJournal", () => {
	const clickStep = { id: "click_search", action: "click", args: [{ by: "text", value: "Search" }], intent: "Push Search" } as TrainingRunJobStep["definition"];
	const trainingStep = (stepId: string, definition = clickStep): TrainingRunJobStep => ({ id: 1, jobId: 1, stepId, definition, createdAt: new Date() });

	it("nests the executed Step and its target description under the Step entry", () => {
		const journal = buildJournal(
			[entry({ kind: TranscriptKind.Step, text: { stepId: "click_search", outcome: "succeeded", targetDescription: { component: "button", selector: "text='Search'" }, inputs: [], outputs: [] } })],
			[trainingStep("click_search")]
		);

		expect(journal).toEqual([
			{
				kind: "Step",
				outcome: "succeeded",
				outputs: [],
				step: { definition: clickStep, targetDescription: { component: "button", selector: "text='Search'" } }
			}
		]);
	});

	it("carries only masked output values and the redacted error", () => {
		const journal = buildJournal(
			[
				entry({
					kind: TranscriptKind.Step,
					text: {
						stepId: "click_search",
						outcome: "failed",
						targetDescription: { component: "button", selector: "" },
						inputs: [{ fieldName: "password", safeValue: "***", sensitivityType: 1 }],
						outputs: [{ fieldName: "total", safeValue: "42", sensitivityType: 1 }],
						error: "fill failed: ***"
					}
				})
			],
			[trainingStep("click_search")]
		);

		expect(journal[0]).toMatchObject({ outputs: [{ fieldName: "total", safeValue: "42" }], error: "fill failed: ***" });
		expect(JSON.stringify(journal)).not.toContain("sensitivityType");
	});

	it("leaves non-Step entries without a step", () => {
		const journal = buildJournal(
			[entry({ kind: TranscriptKind.Status, text: "Picked up by Runner 1" }), entry({ kind: TranscriptKind.Observe, text: "Page shows no results" })],
			[]
		);

		expect(journal).toEqual([
			{ kind: "Status", text: "Picked up by Runner 1" },
			{ kind: "Observe", text: "Page shows no results" }
		]);
	});

	it("crashes when a Step entry has no stored definition", () => {
		const stepEntry = entry({ kind: TranscriptKind.Step, text: { stepId: "ghost", outcome: "succeeded", targetDescription: { component: "button", selector: "" }, inputs: [], outputs: [] } });

		expect(() => buildJournal([stepEntry], [])).toThrow("ghost");
	});
});
