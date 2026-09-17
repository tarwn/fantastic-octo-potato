import { loadConfig } from "./config.ts";
import { log } from "./logger.ts";
import { startPollLoop } from "./pollLoop.ts";
import { initRunner } from "./runnerClient.ts";

log("service started");

try {
	const config = loadConfig();
	const { pollIntervalSeconds, interventionTimeoutSeconds } = await initRunner(config);
	log(`init ok: pollIntervalSeconds=${pollIntervalSeconds} interventionTimeoutSeconds=${interventionTimeoutSeconds}`);
	startPollLoop(config, pollIntervalSeconds, interventionTimeoutSeconds);
}
catch (err) {
	log(`init failed: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
