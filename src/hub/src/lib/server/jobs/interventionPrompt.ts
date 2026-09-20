import type Database from "better-sqlite3";

import type { ChildStep, RecipeDefinition } from "../../types/recipeDefinition";
import { deriveNextStep } from "../llm/nextStep";
import { readJobStepArtifact } from "../storage/artifactStorage";
import { listJobStepArtifactsForJob, listTranscriptEntries } from "../storage/repositories/jobRepository";

import { summarizeTranscriptForLlm } from "./transcriptSummary";

// Ending or redirecting the run is the operator's Hand Back / End Job, so only browser-facing actions are commands.
const COMMAND_ACTIONS = new Set(["open", "click", "focus", "fill", "select", "scrollIntoView", "scroll", "read", "check", "verify", "assign"]);

export function isCommandAction(step: ChildStep): boolean {
	return COMMAND_ACTIONS.has(step.action);
}

// The model sees only the operator's prompt, the Runner-masked latest screenshot, the masked Transcript,
// and the Recipe's declared names. Credentials are never offered to an operator prompt.
export function convertPromptToStep(db: Database.Database, jobId: number, definition: RecipeDefinition, prompt: string): Promise<ChildStep> {
	const artifacts = listJobStepArtifactsForJob(db, jobId);
	const latest = artifacts.at(-1);
	return deriveNextStep({
		goal: `Perform exactly this one operator instruction as a single Step, never finish the run: ${prompt}`,
		alternateGoals: [],
		transcriptSummary: summarizeTranscriptForLlm(listTranscriptEntries(db, jobId)),
		maskedScreenshotPngBase64: latest ? readJobStepArtifact(latest.filePath).toString("base64") : undefined,
		knownInputNames: Object.keys(definition.inputs),
		knownOutputNames: Object.keys(definition.outputs),
		knownCredentialNames: [],
		knownStepIds: []
	});
}
