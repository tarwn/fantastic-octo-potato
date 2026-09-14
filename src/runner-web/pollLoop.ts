import type { RunnerConfig } from "./config.ts";
import { log } from "./logger.ts";
import { pollRunner } from "./runnerClient.ts";

export function startPollLoop(config: RunnerConfig, pollIntervalSeconds: number): NodeJS.Timeout {
	return setInterval(() => {
		void pollRunner(config).then(
			(result) => log(`poll: hasWork=${result.hasWork}`),
			(err: unknown) => log(`poll failed: ${err instanceof Error ? err.message : String(err)}`)
		);
	}, pollIntervalSeconds * 1000);
}
