import { describe, expect, it, vi } from "vitest";

import { log } from "./logger.ts";

describe("log", () => {
	it("prefixes the logged line consistently", () => {
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

		log("service started");

		expect(consoleLog).toHaveBeenCalledWith("[runner-web] service started");

		consoleLog.mockRestore();
	});
});
