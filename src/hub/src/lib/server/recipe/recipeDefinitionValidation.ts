import type { RecipeDefinition } from "$lib/types/recipeDefinition";

// Checks structure only (duplicate ids, unknown references/jump targets, invalid enum/action
// values, nesting depth) — it never executes a Step, so it has no opinion on selectors resolving
// at runtime. Called before a Recipe definition is ever persisted or dispatched.

const ACTIONS = new Set([
	"open",
	"click",
	"focus",
	"fill",
	"select",
	"scrollIntoView",
	"scroll",
	"read",
	"check",
	"verify",
	"assign",
	"group",
	"if",
	"goto",
	"finish",
	"fail"
]);
const CHILD_ACTIONS = new Set([...ACTIONS].filter((action) => action !== "group" && action !== "if"));
const CONDITION_TESTS = new Set(["exists", "visible", "enabled", "disabled", "assigned", "all", "any"]);
const COMPOSITE_TESTS = new Set(["all", "any"]);
const TARGET_BY = new Set(["text", "label", "placeholder", "css", "point"]);
const READ_TYPES = new Set(["text", "value", "number"]);
const READ_SPEC_SOURCES = new Set(["text", "value"]);
const READ_SPEC_PARSES = new Set(["string", "number"]);
const READ_SPEC_KEYS = new Set(["source", "extract", "parse"]);
const EXTRACT_KEYS = new Set(["by", "pattern", "group"]);
// Mirrored by runner-web's own copy; patterns are only length-capped, not safe-regex checked.
export const MAX_EXTRACTION_PATTERN_LENGTH = 200;

type StepLike = { id?: unknown; action?: unknown; args?: unknown[] };
type IfCaseLike = { when?: unknown; steps?: unknown[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
	return Object.keys(value).every((key) => allowed.has(key));
}

function isValidGroup(group: unknown): boolean {
	return (typeof group === "number" && Number.isInteger(group) && group >= 0) || (typeof group === "string" && group !== "");
}

function isCompilablePattern(pattern: string): boolean {
	try {
		new RegExp(pattern);
		return true;
	}
	catch {
		return false;
	}
}

function isValidReadSpec(spec: unknown): boolean {
	if (!isRecord(spec) || !hasOnlyKeys(spec, READ_SPEC_KEYS) || !READ_SPEC_SOURCES.has(spec.source as string)) {
		return false;
	}
	if (spec.parse !== undefined && !READ_SPEC_PARSES.has(spec.parse as string)) {
		return false;
	}
	const extract = spec.extract;
	return (
		isRecord(extract) &&
		hasOnlyKeys(extract, EXTRACT_KEYS) &&
		extract.by === "regex" &&
		typeof extract.pattern === "string" &&
		extract.pattern !== "" &&
		extract.pattern.length <= MAX_EXTRACTION_PATTERN_LENGTH &&
		isCompilablePattern(extract.pattern) &&
		isValidGroup(extract.group)
	);
}

// Shared by validateRecipeDefinition (a full Recipe, finish requires a non-null checkpoint) and
// validateAtomicStep (one Training next-Step at a time, steps-dsl.md: "Training finish may use
// null") — the only difference between those two callers is finish's checkpoint requirement and
// how a value reference's known input/output names are known ahead of time.
function checkStepShape(
	step: unknown,
	isChild: boolean,
	errors: string[],
	mainStepIds: Set<string>,
	checkValueRef: (value: unknown) => void,
	requireFinishCheckpoint: boolean,
	// A Destination (read/assign's target) *creates* an output rather than referencing one — Training's
	// discovery loop invents new output names as it goes (nextStepPrompt.ts: "Reference or create an
	// output destination"), so this never requires the name to already be known the way checkValueRef
	// does. A full Recipe still wants it checked against its pre-declared outputs, so
	// validateRecipeDefinition passes its own checkValueRef here too.
	checkDestination: (value: unknown) => void
): void {
	let currentStepId = "<missing id>";

	function checkTarget(target: unknown): void {
		if (!isRecord(target)) {
			return;
		}
		if ("exact" in target) {
			if (target.by !== "text") {
				errors.push(`Step ${currentStepId}: 'exact' is only valid on text targets`);
			}
			else if (typeof target.exact !== "boolean") {
				errors.push(`Step ${currentStepId}: 'exact' must be a boolean`);
			}
		}
		if (!TARGET_BY.has(String(target.by))) {
			errors.push(`Invalid target 'by' value: ${String(target.by)}`);
		}
		if (isRecord(target.value) && "ref" in target.value) {
			if (target.value.ref === "input") {
				checkValueRef(target.value);
			}
			else {
				errors.push(`Target value may only reference an input, not: ${String(target.value.ref)}`);
			}
		}
	}

	function checkCondition(condition: unknown, allowComposite = true): void {
		if (!isRecord(condition)) {
			return;
		}
		const test = condition.test;
		const args = (condition.args as unknown[]) ?? [];
		if (typeof test !== "string" || !CONDITION_TESTS.has(test)) {
			errors.push(`Invalid condition test: ${String(test)}`);
			return;
		}
		if (COMPOSITE_TESTS.has(test)) {
			if (!allowComposite) {
				errors.push(`Nested composite condition not allowed: ${test}`);
			}
			args.forEach((arg) => checkCondition(arg, false));
			return;
		}
		if (test === "assigned") {
			checkValueRef(args[0]);
			return;
		}
		checkTarget(args[0]);
	}

	function checkStep(step: unknown, isChild: boolean): void {
		if (!isRecord(step)) {
			return;
		}
		const s = step as StepLike;
		const id = typeof s.id === "string" ? s.id : "<missing id>";
		currentStepId = id;

		if (typeof s.action !== "string" || !ACTIONS.has(s.action)) {
			errors.push(`Step ${id}: invalid action: ${String(s.action)}`);
			return;
		}
		if (isChild && !CHILD_ACTIONS.has(s.action)) {
			errors.push(`Step ${id}: nested group/if is not allowed beyond one level`);
			return;
		}

		const args = s.args ?? [];
		switch (s.action) {
			case "open":
				checkValueRef(args[0]);
				break;
			case "click":
			case "focus":
			case "scrollIntoView":
				checkTarget(args[0]);
				break;
			case "fill":
				checkTarget(args[0]);
				checkValueRef(args[1]);
				break;
			case "select":
				checkTarget(args[0]);
				((args[1] as { by?: unknown; value?: unknown }[]) ?? []).forEach((option) => {
					if (option.by !== "value" && option.by !== "label") {
						errors.push(`Step ${id}: invalid select option 'by' value: ${String(option.by)}`);
					}
					checkValueRef(option.value);
				});
				break;
			case "read":
				checkTarget(args[0]);
				if (isRecord(args[1])) {
					if (!isValidReadSpec(args[1])) {
						errors.push(`Step ${id}: invalid read spec`);
					}
				}
				else if (!READ_TYPES.has(args[1] as string)) {
					errors.push(`Step ${id}: invalid read type: ${String(args[1])}`);
				}
				checkDestination(args[2]);
				break;
			case "check":
			case "verify":
				checkCondition(args[0]);
				break;
			case "assign":
				checkDestination(args[0]);
				checkValueRef(args[1]);
				break;
			case "goto":
				if (typeof args[0] !== "string" || !mainStepIds.has(args[0])) {
					errors.push(`Step ${id}: unknown goto target: ${String(args[0])}`);
				}
				break;
			case "finish":
				if (args[0] === null || args[0] === undefined) {
					if (requireFinishCheckpoint) {
						errors.push(`Step ${id}: finish requires a non-null checkpoint condition`);
					}
				}
				else {
					checkCondition(args[0]);
				}
				break;
			case "group":
				((args[0] as unknown[]) ?? []).forEach((child) => checkStep(child, true));
				break;
			case "if": {
				const cases = (args[0] as IfCaseLike[]) ?? [];
				cases.forEach((ifCase) => {
					checkCondition(ifCase.when);
					(ifCase.steps ?? []).forEach((child) => checkStep(child, true));
				});
				((args[1] as unknown[]) ?? []).forEach((child) => checkStep(child, true));
				break;
			}
			// scroll and fail carry no target/reference/condition to validate here.
		}
	}

	checkStep(step, isChild);
}

// Validates one atomic Training next-Step (steps-dsl.md, C003: no group/if) in isolation, against
// the Ingredient/output field names observed so far — a Training run has no fixed input/output
// schema up front (unlike a full Recipe), and no named main Steps to `goto`.
export function validateAtomicStep(
	step: unknown,
	knownInputNames: ReadonlySet<string>,
	knownOutputNames: ReadonlySet<string>,
	knownCredentialNames: ReadonlySet<string> = new Set()
): string[] {
	const errors: string[] = [];
	const checkValueRef = (value: unknown): void => {
		if (!isRecord(value) || !("ref" in value)) {
			return;
		}
		const ref = value as { ref?: unknown; name?: unknown };
		if (ref.ref === "input" && !knownInputNames.has(String(ref.name))) {
			errors.push(`Unknown input reference: ${String(ref.name)}`);
		}
		if (ref.ref === "output" && !knownOutputNames.has(String(ref.name))) {
			errors.push(`Unknown output reference: ${String(ref.name)}`);
		}
		if (ref.ref === "credential" && !knownCredentialNames.has(String(ref.name))) {
			errors.push(`Unknown credential reference: ${String(ref.name)}`);
		}
	};
	// A destination's output name is never checked against knownOutputNames — it's what *creates*
	// that name for later Steps to reference, not a reference to one that must already exist.
	const checkDestination = (): void => undefined;
	checkStepShape(step, true, errors, new Set(), checkValueRef, false, checkDestination);
	return errors;
}

export function validateRecipeDefinition(definition: RecipeDefinition, knownCredentialNames: ReadonlySet<string> = new Set()): string[] {
	const errors: string[] = [];
	const seenIds = new Set<string>();
	const mainStepIds = new Set<string>();

	function collectIds(steps: unknown[], isChild: boolean): void {
		for (const step of steps) {
			if (!isRecord(step)) {
				continue;
			}
			const s = step as StepLike;
			if (typeof s.id === "string") {
				if (seenIds.has(s.id)) {
					errors.push(`Duplicate step id: ${s.id}`);
				}
				seenIds.add(s.id);
				if (!isChild) {
					mainStepIds.add(s.id);
				}
			}
			if (s.action === "group") {
				collectIds((s.args?.[0] as unknown[]) ?? [], true);
			}
			if (s.action === "if") {
				const cases = (s.args?.[0] as IfCaseLike[]) ?? [];
				for (const ifCase of cases) {
					collectIds(ifCase.steps ?? [], true);
				}
				collectIds((s.args?.[1] as unknown[]) ?? [], true);
			}
		}
	}

	function checkValueRef(value: unknown): void {
		if (!isRecord(value) || !("ref" in value)) {
			return;
		}
		const ref = value as { ref?: unknown; name?: unknown };
		if (ref.ref === "input" && !(String(ref.name) in definition.inputs)) {
			errors.push(`Unknown input reference: ${String(ref.name)}`);
		}
		if (ref.ref === "output" && !(String(ref.name) in definition.outputs)) {
			errors.push(`Unknown output reference: ${String(ref.name)}`);
		}
		if (ref.ref === "credential" && !knownCredentialNames.has(String(ref.name))) {
			errors.push(`Unknown credential reference: ${String(ref.name)}`);
		}
	}

	function checkStep(step: unknown, isChild: boolean): void {
		checkStepShape(step, isChild, errors, mainStepIds, checkValueRef, true, checkValueRef);
	}

	collectIds(definition.steps, false);
	for (const recovery of definition.recoveries) {
		if (seenIds.has(recovery.id)) {
			errors.push(`Duplicate step id: ${recovery.id}`);
		}
		seenIds.add(recovery.id);
		collectIds(recovery.steps, true);
	}

	definition.steps.forEach((step) => checkStep(step, false));
	for (const recovery of definition.recoveries) {
		// No standalone checkCondition entry point on the shared shape-checker — a synthetic
		// `verify` step reuses its condition-checking branch without duplicating it here.
		checkStep({ id: recovery.id, action: "verify", args: [recovery.when] }, false);
		recovery.steps.forEach((child) => checkStep(child, true));
	}

	return errors;
}
