import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { resetUserData } from "./reset";

describe("resetUserData", () => {
	it("does nothing when the user-defined tables don't exist yet", () => {
		const db = new Database(":memory:");

		expect(() => resetUserData(db)).not.toThrow();
	});
});
