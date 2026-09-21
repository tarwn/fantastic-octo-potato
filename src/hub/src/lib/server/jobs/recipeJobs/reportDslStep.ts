import type Database from "better-sqlite3";

import { TranscriptKind } from "../../storage/db/jobTranscriptKind";
import { JobType } from "../../storage/db/jobType";
import { SensitivityType } from "../../storage/db/sensitivityType";
import {
	appendAutoSequencedTranscriptEntry,
	type Job,
	maskValue,
	type TranscriptFieldRef,
	updateJobHeartbeat,
	upsertJobResult
} from "../../storage/repositories/jobRepository";
import { getRecipeById } from "../../storage/repositories/recipeRepository";
import { updateRunnerHeartbeat } from "../../storage/repositories/runnerRepository";
import type { JobActionResult, ReportStepBody } from "../types";

// Transcript rows never carry the raw extracted value — only the destination field name and
// outcome (folded into `message`) plus the already-masked safeValue.
export function reportDslStep(
	db: Database.Database,
	job: Extract<Job, { jobType: JobType.Recipe }>,
	runnerId: number,
	step: Extract<ReportStepBody, { kind: "dslStep" }>,
	now: Date
): JobActionResult {
	if (job.details.recipeId === null) {
		throw new Error(`Job ${job.id} is a Recipe Job with no recipe_id set`);
	}
	const recipe = getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references Recipe ${job.details.recipeId}, which no longer exists`);
	}

	const outputs: TranscriptFieldRef[] = [];
	for (const extraction of step.extractions) {
		const outputDeclaration = recipe.definition.outputs[extraction.fieldName];
		if (!outputDeclaration) {
			return { status: 400, body: { error: `Unknown output: ${extraction.fieldName}` } };
		}
		const sensitivityType = outputDeclaration.sensitive ? SensitivityType.Other : SensitivityType.None;
		upsertJobResult(db, job.id, extraction.fieldName, extraction.value, sensitivityType, now);
		outputs.push({ fieldName: extraction.fieldName, safeValue: maskValue(extraction.value, sensitivityType), sensitivityType });
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
			outputs,
			...(step.error !== undefined ? { error: step.error } : {})
		},
		now
	);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runnerId, now);

	return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
}
