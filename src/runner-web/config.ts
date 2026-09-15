export interface RunnerConfig {
	hubUrl: string;
	runnerId: string;
	runnerSharedSecret: string;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is not set. Copy src/runner-web/.env.example to src/runner-web/.env and set it.`);
	}
	return value;
}

export function loadConfig(): RunnerConfig {
	return {
		hubUrl: requireEnv("HUB_URL"),
		runnerId: requireEnv("RUNNER_ID"),
		runnerSharedSecret: requireEnv("RUNNER_SHARED_SECRET")
	};
}
