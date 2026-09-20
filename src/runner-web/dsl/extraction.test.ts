import { describe, expect, it } from "vitest";

import { DslActionError } from "./errors.ts";
import { extractFromText, MAX_EXTRACTION_PATTERN_LENGTH, MAX_EXTRACTION_SOURCE_LENGTH, validateReadSpec } from "./extraction.ts";
import type { ReadSpec } from "./types.ts";

function spec(pattern: string, group: number | string = 1): ReadSpec {
	return { source: "text", extract: { by: "regex", pattern, group } };
}

function failureOf(fn: () => unknown): { code: string; message: string } {
	try {
		fn();
	}
	catch (err) {
		if (err instanceof DslActionError) {
			return { code: err.code, message: err.message };
		}
		throw err;
	}
	throw new Error("expected a DslActionError");
}

describe("extractFromText", () => {
	const source = "Amount: $1200.00\nSales Tax: $75.00";

	it("returns a numbered group unchanged", () => {
		expect(extractFromText(source, spec("Amount:\\s*(\\S+)"))).toBe("$1200.00");
	});

	it("returns a named group", () => {
		expect(extractFromText(source, spec("Amount:\\s*(?<value>\\S+)", "value"))).toBe("$1200.00");
	});

	it("returns the whole match for group 0", () => {
		expect(extractFromText(source, spec("Amount:", 0))).toBe("Amount:");
	});

	it("fails when nothing matches", () => {
		expect(failureOf(() => extractFromText(source, spec("Total:\\s*(\\S+)"))).code).toBe("EXTRACTION_NOT_FOUND");
	});

	it("fails when more than one match exists, without echoing page text", () => {
		const result = failureOf(() => extractFromText(source, spec(":\\s*(\\S+)")));
		expect(result.code).toBe("EXTRACTION_AMBIGUOUS");
		expect(result.message).not.toContain("$");
	});

	it.each([[5], ["missing"]])("fails when group %j does not exist", (group) => {
		expect(failureOf(() => extractFromText(source, spec("Amount:\\s*(?<value>\\S+)", group))).code).toBe("EXTRACTION_GROUP_NOT_FOUND");
	});

	it("fails when the group is an optional one that did not participate", () => {
		expect(failureOf(() => extractFromText(source, spec("Amount:(x)?", 1))).code).toBe("EXTRACTION_GROUP_NOT_FOUND");
	});

	it("fails on a named group when the pattern has no named groups", () => {
		expect(failureOf(() => extractFromText(source, spec("Amount:", "value"))).code).toBe("EXTRACTION_GROUP_NOT_FOUND");
	});

	it("fails on an invalid regex", () => {
		expect(failureOf(() => extractFromText(source, spec("(unclosed"))).code).toBe("INVALID_EXTRACTION_PATTERN");
	});

	it("fails on an over-long pattern", () => {
		const result = failureOf(() => extractFromText(source, spec("a".repeat(MAX_EXTRACTION_PATTERN_LENGTH + 1))));
		expect(result.code).toBe("INVALID_EXTRACTION_PATTERN");
	});

	it("fails on an over-long source without echoing it", () => {
		const result = failureOf(() => extractFromText("secret".repeat(MAX_EXTRACTION_SOURCE_LENGTH), spec("(s)")));
		expect(result.code).toBe("EXTRACTION_NOT_FOUND");
		expect(result.message).not.toContain("secret");
	});
});

describe("validateReadSpec", () => {
	it("accepts a well-formed spec", () => {
		expect(() => validateReadSpec({ source: "value", extract: { by: "regex", pattern: "(a)", group: 1 }, parse: "number" })).not.toThrow();
	});

	it.each([
		["a non-object", "text"],
		["a bad source", { source: "html", extract: { by: "regex", pattern: "(a)", group: 1 } }],
		["a bad parse", { source: "text", parse: "date", extract: { by: "regex", pattern: "(a)", group: 1 } }],
		["an extra key", { source: "text", flags: "i", extract: { by: "regex", pattern: "(a)", group: 1 } }],
		["a bad extract kind", { source: "text", extract: { by: "xpath", pattern: "(a)", group: 1 } }],
		["a negative group", { source: "text", extract: { by: "regex", pattern: "(a)", group: -1 } }],
		["an empty pattern", { source: "text", extract: { by: "regex", pattern: "", group: 1 } }]
	])("rejects %s", (_name, bad) => {
		expect(failureOf(() => validateReadSpec(bad)).code).toBe("INVALID_EXTRACTION_PATTERN");
	});
});
