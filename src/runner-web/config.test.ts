import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.ts";

const ENV_KEYS = ["HUB_URL", "RUNNER_ID", "RUNNER_SHARED_SECRET"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of ENV_KEYS) {
		originalEnv[key] = process.env[key];
	}
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (originalEnv[key] === undefined) {
			delete process.env[key];
		}
		else {
			process.env[key] = originalEnv[key];
		}
	}
});

describe("loadConfig", () => {
	it("returns the configured values when all are set", () => {
		process.env.HUB_URL = "http://localhost:4173";
		process.env.RUNNER_ID = "1";
		process.env.RUNNER_SHARED_SECRET = "the-secret";

		expect(loadConfig()).toEqual({
			hubUrl: "http://localhost:4173",
			runnerId: "1",
			runnerSharedSecret: "the-secret"
		});
	});

	it.each(ENV_KEYS)("throws when %s is missing", (missingKey) => {
		process.env.HUB_URL = "http://localhost:4173";
		process.env.RUNNER_ID = "1";
		process.env.RUNNER_SHARED_SECRET = "the-secret";
		delete process.env[missingKey];

		expect(() => loadConfig()).toThrow(new RegExp(`${missingKey} is not set`));
	});
});
