import { runRecipeJobLoop } from "./orchestrator/automaticLoop.ts";
import { runTrainingJobLoop } from "./orchestrator/trainingLoop.ts";
import type { RunnerConfig } from "./config.ts";
import { log } from "./logger.ts";
import { isRecipeJob, pollRunner } from "./runnerClient.ts";

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
							await runTrainingJobLoop(config, result.job);
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
