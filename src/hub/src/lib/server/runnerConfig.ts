import { env } from "$env/dynamic/private";

// Single hardcoded default (no per-runner config yet), overridable via env so
// e2e tests can run the poll loop at a fast interval.
const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const DEFAULT_INTERVENTION_TIMEOUT_SECONDS = 300;

export function requireRunnerSharedSecret(): string {
	if (!env.RUNNER_SHARED_SECRET) {
		throw new Error(
			"RUNNER_SHARED_SECRET is not set. Copy src/hub/.env.example to src/hub/.env and set it before starting hub."
		);
	}
	return env.RUNNER_SHARED_SECRET;
}

function readSecondsOverride(name: string, value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${name} is set to "${value}", which is not a valid number of seconds.`);
	}
	return parsed;
}

export function getPollIntervalSeconds(): number {
	return readSecondsOverride("RUNNER_POLL_INTERVAL_SECONDS", env.RUNNER_POLL_INTERVAL_SECONDS, DEFAULT_POLL_INTERVAL_SECONDS);
}

export function getInterventionTimeoutSeconds(): number {
	return readSecondsOverride(
		"RUNNER_INTERVENTION_TIMEOUT_SECONDS",
		env.RUNNER_INTERVENTION_TIMEOUT_SECONDS,
		DEFAULT_INTERVENTION_TIMEOUT_SECONDS
	);
}
