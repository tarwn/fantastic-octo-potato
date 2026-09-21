import { DslActionError } from "./errors.ts";
import type { ReadSpec } from "./types.ts";

// Mirrored by Hub's validator (MAX_EXTRACTION_PATTERN_LENGTH); patterns are only length-capped, not safe-regex checked.
export const MAX_EXTRACTION_PATTERN_LENGTH = 200;
export const MAX_EXTRACTION_SOURCE_LENGTH = 20000;

const READ_SPEC_SOURCES = ["text", "value"];
const READ_SPEC_PARSES = ["string", "number"];
const READ_SPEC_KEYS = ["source", "extract", "parse"];
const EXTRACT_KEYS = ["by", "pattern", "group"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}

function isValidGroup(group: unknown): boolean {
	return (typeof group === "number" && Number.isInteger(group) && group >= 0) || (typeof group === "string" && group !== "");
}

// Hub validates too, but the Runner never trusts the shape of a dispatched Step.
function isWellFormedSpec(spec: unknown): spec is ReadSpec {
	if (!isRecord(spec) || !hasOnlyKeys(spec, READ_SPEC_KEYS) || !READ_SPEC_SOURCES.includes(spec.source as string)) {
		return false;
	}
	if (spec.parse !== undefined && !READ_SPEC_PARSES.includes(spec.parse as string)) {
		return false;
	}
	const extract = spec.extract;
	return isRecord(extract) && hasOnlyKeys(extract, EXTRACT_KEYS) && extract.by === "regex" && typeof extract.pattern === "string" && isValidGroup(extract.group);
}

function compilePattern(spec: unknown): { regex: RegExp; group: number | string } {
	if (!isWellFormedSpec(spec)) {
		throw new DslActionError("INVALID_EXTRACTION_PATTERN", "The read spec is malformed");
	}
	const { pattern, group } = spec.extract;
	if (pattern === "" || pattern.length > MAX_EXTRACTION_PATTERN_LENGTH) {
		throw new DslActionError("INVALID_EXTRACTION_PATTERN", `The extraction pattern must be 1-${MAX_EXTRACTION_PATTERN_LENGTH} characters`);
	}
	try {
		return { regex: new RegExp(pattern, "g"), group };
	}
	catch {
		throw new DslActionError("INVALID_EXTRACTION_PATTERN", "The extraction pattern is not a valid regular expression");
	}
}

export function validateReadSpec(spec: unknown): void {
	compilePattern(spec);
}

// Messages never include the source text or the capture: both can carry page data.
export function extractFromText(source: string, spec: ReadSpec): string {
	const { regex, group } = compilePattern(spec);
	if (source.length > MAX_EXTRACTION_SOURCE_LENGTH) {
		throw new DslActionError("EXTRACTION_NOT_FOUND", `The source text is longer than ${MAX_EXTRACTION_SOURCE_LENGTH} characters`);
	}
	const matches = [...source.matchAll(regex)];
	if (matches.length === 0) {
		throw new DslActionError("EXTRACTION_NOT_FOUND", "The extraction pattern did not match the source text");
	}
	if (matches.length > 1) {
		throw new DslActionError("EXTRACTION_AMBIGUOUS", `The extraction pattern matched ${matches.length} times, expected exactly one`);
	}
	const captured = typeof group === "number" ? matches[0][group] : matches[0].groups?.[group];
	if (captured === undefined) {
		throw new DslActionError("EXTRACTION_GROUP_NOT_FOUND", `The extraction pattern has no captured group ${JSON.stringify(group)} in its match`);
	}
	return captured;
}
