export type RunnerStatus = "alive" | "idle";

const ALIVE_THRESHOLD_MS = 60_000;

export function getRunnerStatus(lastHeartbeatOn: Date | null, now: Date): RunnerStatus {
	if (lastHeartbeatOn === null) {
		return "idle";
	}
	return now.getTime() - lastHeartbeatOn.getTime() <= ALIVE_THRESHOLD_MS ? "alive" : "idle";
}
