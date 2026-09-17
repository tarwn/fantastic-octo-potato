import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveCredential } from "./credentials.ts";

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
