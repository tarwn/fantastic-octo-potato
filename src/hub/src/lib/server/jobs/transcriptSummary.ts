import { TranscriptKind } from "../storage/db/jobTranscriptKind";
import type { JobTranscriptEntry } from "../storage/repositories/jobRepository";

// Compact, oldest-first text rendering of a Job's transcript for an LLM prompt (R003/R006). Every
// value here already came through jobRepository as a masked/safe projection (R011) — this
// function never touches a raw value.
export function summarizeTranscriptForLlm(entries: JobTranscriptEntry[]): string {
	return entries
		.filter((entry) => entry.kind !== TranscriptKind.Status)
		.map((entry) => summarizeEntry(entry))
		.join("\n");
}

function summarizeEntry(entry: JobTranscriptEntry): string {
	if (entry.kind === TranscriptKind.Step) {
		const outputs = entry.text.outputs.map((output) => `${output.fieldName}=${output.safeValue}`).join(", ");
		return `Step: ${entry.text.message}${outputs ? ` (extracted: ${outputs})` : ""}`;
	}
	return `${TranscriptKind[entry.kind]}: ${entry.text}`;
}
