import { runRecipeJobLoop } from "./dsl/automaticLoop.ts";
import type { RunnerConfig } from "./config.ts";
import { log } from "./logger.ts";
import { type ClaimedJob, isRecipeJob, type JobStep, pollRunner, reportStep, RunnerHttpError } from "./runnerClient.ts";

// A no-op browser/LLM stand-in still takes a beat per step — without it, a short scripted
// sequence reports its whole run before anything polling the Job (e.g. the Hub UI, or this
// spec's e2e guard) has a chance to observe the intermediate Running state.
const STEP_ACTION_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs the claimed Job's scripted-step loop: report each step, then keep following whatever
// the response hands back — Hub alone decides the next step or the terminal status — until a
// response carries no `nextStep`, at which point the Job is terminal.
async function runJobLoop(config: RunnerConfig, job: ClaimedJob): Promise<void> {
	let step: JobStep | undefined = job.nextStep;

	while (step) {
		log(`job ${job.id}: step ${step.sequence} — ${step.text}`);
		await sleep(STEP_ACTION_DELAY_MS);

		const outputs = step.resultField !== undefined ? [{ fieldName: step.resultField, value: step.resultValue }] : [];

		let result;
		try {
			result = await reportStep(config, job.id, { kind: "step", sequence: step.sequence, message: step.text, inputs: [], outputs });
		}
		catch (err: unknown) {
			// A 403/404 is an expected race (ownership changed, or the Job is gone); anything else
			// (network blip, 5xx) is unexpected but still shouldn't crash the process — Hub may still
			// have other work to poll for, unlike a broken bearer secret at init.
			if (err instanceof RunnerHttpError) {
				log(`job ${job.id}: reportStep ${err.status}, abandoning job loop back to polling: ${err.message}`);
			}
			else {
				log(`job ${job.id}: reportStep failed, abandoning job loop back to polling: ${err instanceof Error ? err.message : String(err)}`);
			}
			return;
		}

		step = result.nextStep;
	}

	log(`job ${job.id}: reached a terminal status, resuming polling`);
}

export function startPollLoop(config: RunnerConfig, pollIntervalSeconds: number, interventionTimeoutSeconds: number): NodeJS.Timeout {
	let jobLoopRunning = false;

	return setInterval(() => {
		if (jobLoopRunning) {
			return;
		}

		void pollRunner(config).then(
			async (result) => {
				log(`poll: hasWork=${result.hasWork}`);
				if (result.hasWork && result.job) {
					jobLoopRunning = true;
					try {
						if (isRecipeJob(result.job)) {
							await runRecipeJobLoop(config, result.job, interventionTimeoutSeconds);
						}
						else {
							await runJobLoop(config, result.job);
						}
					}
					finally {
						jobLoopRunning = false;
					}
				}
			},
			(err: unknown) => log(`poll failed: ${err instanceof Error ? err.message : String(err)}`)
		);
	}, pollIntervalSeconds * 1000);
}
