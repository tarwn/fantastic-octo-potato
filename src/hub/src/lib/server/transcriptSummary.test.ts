import { describe, expect, it } from "vitest";

import { TranscriptKind } from "./db/jobTranscriptKind";
import type { JobTranscriptEntry } from "./repositories/jobRepository";
import { summarizeTranscriptForLlm } from "./transcriptSummary";

function entry(overrides: Partial<JobTranscriptEntry> & Pick<JobTranscriptEntry, "kind" | "text">): JobTranscriptEntry {
	return { id: 1, jobId: 1, sequence: 1, createdAt: new Date("2026-09-15T00:00:00.000Z"), jobStatusId: null, ...overrides } as JobTranscriptEntry;
}

describe("summarizeTranscriptForLlm", () => {
	it("renders a Step entry with its extracted outputs", () => {
		const summary = summarizeTranscriptForLlm([
			entry({ kind: TranscriptKind.Step, text: { message: "click_search: succeeded", inputs: [], outputs: [] } })
		]);

		expect(summary).toBe("Step: click_search: succeeded");
	});

	it("includes extracted output field names and safe values", () => {
		const summary = summarizeTranscriptForLlm([
			entry({
				kind: TranscriptKind.Step,
				text: { message: "read_total: succeeded", inputs: [], outputs: [{ fieldName: "total", safeValue: "42", sensitivityType: 1 }] }
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
