import { describe, expect, it } from "vitest";

import { fromDbDate, toDbDate } from "./dates";

describe("toDbDate / fromDbDate", () => {
	it("round-trips a Date through its ISO-8601 string form", () => {
		const date = new Date("2026-09-14T00:06:12.000Z");

		expect(fromDbDate(toDbDate(date))).toEqual(date);
	});

	it("serializes to ISO-8601 text", () => {
		const date = new Date("2026-09-14T00:06:12.000Z");

		expect(toDbDate(date)).toBe("2026-09-14T00:06:12.000Z");
	});

	it("parses ISO-8601 text read back from the database", () => {
		expect(fromDbDate("2026-09-14T00:06:12.000Z")).toEqual(new Date("2026-09-14T00:06:12.000Z"));
	});
});
