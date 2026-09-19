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
import { summarizeTranscriptForLlm } from "../transcriptSummary";
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

	const message = `${step.parentStepId ? `${step.parentStepId} > ` : ""}${step.stepId}: ${step.outcome}`;
	appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Step, { message, inputs: [], outputs }, now);
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
			knownCredentialNames
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

	// validateAtomicStep checks one Step in isolation and has no visibility into ids already used
	// this run — a repeat id would otherwise only surface as training_job_step's UNIQUE constraint
	// throwing after the writes above already committed. Caught here instead, before any of that,
	// and treated the same as an invalid LLM response (steps-dsl.md: "IDs are unique across main
	// steps").
	if (listTrainingRunJobSteps(db, job.id).some((existing) => existing.stepId === next.id)) {
		updateJobStatus(db, job.id, JobStatus.CompletedError, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			`Next-Step generation failed: LLM reused an already-used Step id: ${next.id}`,
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

		// A compilation failure is recorded but never flips the Job's already-Completed-Success
		// status, and never leaves a partially-written/updated draft Recipe (R007) — createDraftRecipe
		// itself re-validates before persisting.
		try {
			const definition = await compileRecipe({
				goal: job.details.goal,
				transcriptSummary,
				executedSteps: listTrainingRunJobSteps(db, job.id).map((trainingStep) => trainingStep.definition),
				ingredients: listSafeJobIngredients(db, job.id),
				results: listSafeJobResults(db, job.id)
			});
			createDraftRecipe(db, {
				customerApplicationXrefId: job.customerApplicationXrefId,
				name: job.details.goal,
				goal: job.details.goal,
				definition,
				sourceTrainingRunId: String(job.id),
				createdAt: now
			});
		}
		catch (err) {
			if (!(err instanceof RecipeCompilationInvalidResponseError)) {
				throw err;
			}
			appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Info, `Recipe compilation failed: ${err.message}`, now);
		}

		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } };
	}

	return { status: 200, body: { data: { jobStatusId: JobStatus.Running, nextStep: next } } };
}
