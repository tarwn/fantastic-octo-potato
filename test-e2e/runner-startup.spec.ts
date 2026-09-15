import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "..");

// Red until the runner's poll loop is implemented.
const RUNNER_ID = "1";
const RUNNER_SHARED_SECRET = "test-e2e-shared-secret";

test("runner-web initializes against hub and enters its poll loop", async ({ baseURL }) => {
	if (!baseURL) {
		throw new Error("baseURL is not set");
	}

	const output: string[] = [];
	const runner = spawn(process.execPath, ["--watch", "src/runner-web/index.ts"], {
		cwd: WORKSPACE_ROOT,
		env: {
			...process.env,
			HUB_URL: baseURL,
			RUNNER_ID,
			RUNNER_SHARED_SECRET
		}
	});

	runner.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.on("error", (err) => output.push(`[test] failed to spawn runner-web: ${err.message}`));

	try {
		await expect
			.poll(() => output.join(""), { timeout: 15_000 })
			.toMatch(/init ok:.*pollIntervalSeconds.*interventionTimeoutSeconds/i);

		await expect
			.poll(() => (output.join("").match(/poll: hasWork=false/g) ?? []).length, { timeout: 15_000 })
			.toBeGreaterThanOrEqual(2);
	}
	finally {
		runner.kill();
	}
});
