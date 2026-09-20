import { TranscriptKind } from "../storage/db/jobTranscriptKind";
import type { JobTranscriptEntry, TrainingRunJobStep, TranscriptFieldRef } from "../storage/repositories/jobRepository";

import type { StepTargetDescription } from "$lib/types/job";
import type { ChildStep } from "$lib/types/recipeDefinition";

type NonStepKindName = Exclude<keyof typeof TranscriptKind, "Step">;

export type JournalEntry =
	| { kind: NonStepKindName; text: string }
	| {
			kind: "Step";
			outcome: "succeeded" | "failed";
			outputs: Pick<TranscriptFieldRef, "fieldName" | "safeValue">[];
			error?: string;
			step: { definition: ChildStep; targetDescription: StepTargetDescription };
	  };

// Built only from masked transcript data and stored Steps so nothing sensitive is added.
export function buildJournal(entries: JobTranscriptEntry[], trainingSteps: TrainingRunJobStep[]): JournalEntry[] {
	const definitions = new Map(trainingSteps.map((trainingStep) => [trainingStep.stepId, trainingStep.definition]));
	return entries.map((entry) => {
		if (entry.kind !== TranscriptKind.Step) {
			return { kind: TranscriptKind[entry.kind] as NonStepKindName, text: entry.text };
		}
		const { stepId, outcome, outputs, error, targetDescription } = entry.text;
		const definition = definitions.get(stepId);
		if (!definition) {
			throw new Error(`Transcript Step "${stepId}" has no stored Training Run Step definition`);
		}
		return {
			kind: "Step",
			outcome,
			outputs: outputs.map(({ fieldName, safeValue }) => ({ fieldName, safeValue })),
			...(error === undefined ? {} : { error }),
			step: { definition, targetDescription }
		};
	});
}

// Every value here already came through jobRepository as a masked/safe projection, so this never touches a raw value.
export function summarizeTranscriptForLlm(entries: JobTranscriptEntry[]): string {
	return entries
		.filter((entry) => entry.kind !== TranscriptKind.Status)
		.map((entry) => summarizeEntry(entry))
		.join("\n");
}

function summarizeEntry(entry: JobTranscriptEntry): string {
	if (entry.kind === TranscriptKind.Step) {
		const outputs = entry.text.outputs.map((output) => `${output.fieldName}=${output.safeValue}`).join(", ");
		const parent = entry.text.parentStepId ? `${entry.text.parentStepId} > ` : "";
		return `Step: ${parent}${entry.text.stepId}: ${entry.text.outcome}${outputs ? ` (extracted: ${outputs})` : ""}`;
	}
	return `${TranscriptKind[entry.kind]}: ${entry.text}`;
}
