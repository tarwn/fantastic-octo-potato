import type Database from "better-sqlite3";

import { deriveNextStep, NextStepInvalidResponseError } from "../../llm/nextStep";
import { compileRecipe, RecipeCompilationInvalidResponseError } from "../../llm/recipeCompilation";
import { readJobStepArtifact } from "../../storage/artifactStorage";
import { JobStatus } from "../../storage/db/jobStatus";
import { TranscriptKind } from "../../storage/db/jobTranscriptKind";
import { JobType } from "../../storage/db/jobType";
import { SensitivityType } from "../../storage/db/sensitivityType";
import {
	appendAutoSequencedTranscriptEntry,
	appendTranscriptEntry,
	getLatestJobStepArtifact,
	insertTrainingRunJobStep,
	type Job,
	listSafeJobIngredients,
	listSafeJobResults,
	listTrainingRunJobSteps,
	listTranscriptEntries,
	maskValue,
	terminalTranscriptSequence,
	type TranscriptFieldRef,
	updateJobHeartbeat,
	updateJobStatus,
	updateTrainingRunJobCredentialNames,
	upsertJobResult
} from "../../storage/repositories/jobRepository";
import { createDraftRecipe } from "../../storage/repositories/recipeRepository";
import { updateRunnerHeartbeat } from "../../storage/repositories/runnerRepository";
import { buildJournal, summarizeTranscriptForLlm } from "../transcriptSummary";
import type { JobActionResult, ReportStepBody } from "../types";

import type { ChildStep } from "$lib/types/recipeDefinition";

// A Training run has no fixed output schema to validate an extraction's fieldName against (unlike
// Recipe) — real sensitivity classification for an extracted field happens at compile time
// (Step 6), so it's recorded None here.
export async function reportDslStep(
	db: Database.Database,
	job: Extract<Job, { jobType: JobType.TrainingRun }>,
	runnerId: number,
	step: Extract<ReportStepBody, { kind: "dslStep" }>,
	now: Date
): Promise<JobActionResult> {
	const outputs: TranscriptFieldRef[] = step.extractions.map((extraction) => {
		upsertJobResult(db, job.id, extraction.fieldName, extraction.value, SensitivityType.None, now);
		return { fieldName: extraction.fieldName, safeValue: maskValue(extraction.value, SensitivityType.None), sensitivityType: SensitivityType.None };
	});

	// The Runner's only chance to tell Hub what credential names it has — Hub has no other source
	// (they resolve only on the Runner). Overwritten wholesale on whichever report includes it,
	// normally just the first.
	const knownCredentialNames = step.credentialNames ?? job.details.credentialNames;
	if (step.credentialNames !== undefined) {
		updateTrainingRunJobCredentialNames(db, job.id, step.credentialNames);
	}

	appendAutoSequencedTranscriptEntry(
		db,
		job.id,
		TranscriptKind.Step,
		{
			stepId: step.stepId,
			outcome: step.outcome,
			...(step.parentStepId !== undefined ? { parentStepId: step.parentStepId } : {}),
			targetDescription: step.targetDescription,
			inputs: [],
			...(step.error !== undefined ? { error: step.error } : {}),
			outputs
		},
		now
	);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runnerId, now);

	// One fetch, reused below for both the maxSteps count and the LLM transcript summary — this
	// table only grows, so a per-report double scan isn't free once a run gets long.
	const transcriptEntries = listTranscriptEntries(db, job.id);

	// Only executable Steps count toward maxSteps (steps-dsl.md) — Training issues atomic Steps
	// only (C003), so every dslStep report here is one such Step.
	const stepsSoFar = transcriptEntries.filter((entry) => entry.kind === TranscriptKind.Step).length;
	if (stepsSoFar >= job.details.maxSteps) {
		updateJobStatus(db, job.id, JobStatus.CompletedFailed, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			"Reached max steps, marked Completed-Failed",
			now,
			JobStatus.CompletedFailed
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedFailed } } };
	}

	const artifact = getLatestJobStepArtifact(db, job.id, step.stepId);
	const maskedScreenshotPngBase64 = artifact ? readJobStepArtifact(artifact.filePath).toString("base64") : undefined;
	const knownInputNames = listSafeJobIngredients(db, job.id).map((ingredient) => ingredient.fieldName);
	const knownOutputNames = listSafeJobResults(db, job.id).map((result) => result.fieldName);
	const transcriptSummary = summarizeTranscriptForLlm(transcriptEntries);

	let next: ChildStep;
	try {
		next = await deriveNextStep({
			goal: job.details.goal,
			alternateGoals: job.details.alternateGoals,
			transcriptSummary,
			maskedScreenshotPngBase64,
			knownInputNames,
			knownOutputNames,
			knownCredentialNames,
			knownStepIds: listTrainingRunJobSteps(db, job.id).map((trainingStep) => trainingStep.stepId)
		});
	}
	catch (err) {
		if (!(err instanceof NextStepInvalidResponseError)) {
			throw err;
		}
		updateJobStatus(db, job.id, JobStatus.CompletedError, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			`Next-Step generation failed: ${err.message}`,
			now,
			JobStatus.CompletedError
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedError } } };
	}

	// Saved before the Runner ever sees it (insertTrainingRunJobStep) — the transcript row the
	// Runner later reports for this stepId only ever carries message/outcome, never the action/args
	// a Recipe compiler needs to reconstruct what actually ran.
	insertTrainingRunJobStep(db, job.id, next, now);

	// An explicit model-issued finish Step ends discovery immediately (R005) — Training's
	// checkpoint may be null (steps-dsl.md), so satisfying it needs no further Runner round-trip.
	if (next.action === "finish") {
		updateJobStatus(db, job.id, JobStatus.CompletedSuccess, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			"Model issued a finish Step, marked Completed-Success",
			now,
			JobStatus.CompletedSuccess
		);

		// Compilation is its own LLM call and can take a while — this Plan entry gives the
		// transcript something to show for that gap instead of leaving Completed-Success as the
		// last visible row until the draft Recipe (or a failure) eventually appears.
		appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Plan, "Building Trial Recipe from this successful run…", now);

		// A compilation failure is recorded but never flips the Job's already-Completed-Success
		// status, and never leaves a partially-written/updated draft Recipe (R007) — createDraftRecipe
		// itself re-validates before persisting.
		try {
			const { definition, name } = await compileRecipe({
				goal: job.details.goal,
				transcriptSummary,
				journal: buildJournal(transcriptEntries, listTrainingRunJobSteps(db, job.id)),
				ingredients: listSafeJobIngredients(db, job.id),
				results: listSafeJobResults(db, job.id),
				credentialNames: knownCredentialNames
			});
			createDraftRecipe(db, {
				customerApplicationXrefId: job.customerApplicationXrefId,
				name,
				goal: job.details.goal,
				definition,
				sourceTrainingRunId: String(job.id),
				createdAt: now,
				knownCredentialNames
			});
			appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Plan, `Trial Recipe "${name}" created`, now);
		}
		catch (err) {
			if (!(err instanceof RecipeCompilationInvalidResponseError)) {
				throw err;
			}
			appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Plan, `Recipe compilation failed: ${err.message}`, now);
		}

		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } };
	}

	return { status: 200, body: { data: { jobStatusId: JobStatus.Running, nextStep: next } } };
}
