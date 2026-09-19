import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listAvailableCredentialNames, resolveCredential } from "./credentials.ts";

const ENV_KEY = "RUNNER_CREDENTIAL_PASSWORD";
let original: string | undefined;

beforeEach(() => {
	original = process.env[ENV_KEY];
});

afterEach(() => {
	if (original === undefined) {
		delete process.env[ENV_KEY];
	}
	else {
		process.env[ENV_KEY] = original;
	}
});

describe("resolveCredential", () => {
	it("reads RUNNER_CREDENTIAL_<NAME uppercased>", () => {
		process.env[ENV_KEY] = "the-password";
		expect(resolveCredential("password")).toBe("the-password");
	});

	it("throws when the env var is not set", () => {
		delete process.env[ENV_KEY];
		expect(() => resolveCredential("password")).toThrow(/RUNNER_CREDENTIAL_PASSWORD is not set/);
	});
});

describe("listAvailableCredentialNames", () => {
	// Local dev/CI env may already carry real RUNNER_CREDENTIAL_* vars (src/runner-web/.env) —
	// snapshotting and clearing every one of them here, rather than just ENV_KEY above, is what
	// keeps this describe block's expectations exact instead of "at least these names".
	let originalCredentialEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalCredentialEnv = {};
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("RUNNER_CREDENTIAL_")) {
				originalCredentialEnv[key] = process.env[key];
				delete process.env[key];
			}
		}
	});

	afterEach(() => {
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("RUNNER_CREDENTIAL_")) {
				delete process.env[key];
			}
		}
		for (const [key, value] of Object.entries(originalCredentialEnv)) {
			if (value !== undefined) {
				process.env[key] = value;
			}
		}
	});

	it("returns every RUNNER_CREDENTIAL_<NAME> env var's name, lowercased and with the prefix stripped", () => {
		process.env.RUNNER_CREDENTIAL_USERNAME = "admin";
		process.env.RUNNER_CREDENTIAL_PASSWORD = "hunter2";
		expect(listAvailableCredentialNames().sort()).toEqual(["password", "username"]);
	});

	it("ignores env vars that don't start with RUNNER_CREDENTIAL_", () => {
		process.env.RUNNER_ID = "1";
		process.env.HUB_URL = "http://localhost";
		expect(listAvailableCredentialNames()).toEqual([]);
	});

	it("excludes an env var that is exactly the prefix, with no name suffix", () => {
		process.env.RUNNER_CREDENTIAL_ = "orphaned";
		expect(listAvailableCredentialNames()).toEqual([]);
	});

	it("returns an empty list when no credential env vars are set", () => {
		expect(listAvailableCredentialNames()).toEqual([]);
	});
});
