import { describe, expect, it } from "vitest";

import { redactKnownSecrets } from "./textRedaction.ts";

describe("redactKnownSecrets", () => {
	it("masks a known secret embedded in an arbitrary string", () => {
		expect(redactKnownSecrets("login rejected for password hunter2", ["hunter2"])).toBe("login rejected for password ••••••");
	});

	it("masks every occurrence and every listed secret", () => {
		expect(redactKnownSecrets("hunter2 then hunter2 then admin", ["hunter2", "admin"])).toBe("•••••• then •••••• then ••••••");
	});

	it("no-ops on a string without any known secret", () => {
		expect(redactKnownSecrets("net::ERR_CONNECTION_REFUSED at http://localhost:8089/", ["hunter2"])).toBe(
			"net::ERR_CONNECTION_REFUSED at http://localhost:8089/"
		);
	});

	it("ignores empty-string secrets rather than masking everything", () => {
		expect(redactKnownSecrets("hello world", ["", "world"])).toBe("hello ••••••");
	});
});
