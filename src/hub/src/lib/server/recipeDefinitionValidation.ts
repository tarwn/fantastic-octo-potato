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

type StepLike = { id?: unknown; action?: unknown; args?: unknown[] };
type IfCaseLike = { when?: unknown; steps?: unknown[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

export function validateRecipeDefinition(definition: RecipeDefinition): string[] {
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
	}

	function checkTarget(target: unknown): void {
		if (!isRecord(target)) {
			return;
		}
		if (!TARGET_BY.has(String(target.by))) {
			errors.push(`Invalid target 'by' value: ${String(target.by)}`);
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
				if (!READ_TYPES.has(args[1] as string)) {
					errors.push(`Step ${id}: invalid read type: ${String(args[1])}`);
				}
				checkValueRef(args[2]);
				break;
			case "check":
			case "verify":
				checkCondition(args[0]);
				break;
			case "assign":
				checkValueRef(args[0]);
				checkValueRef(args[1]);
				break;
			case "goto":
				if (typeof args[0] !== "string" || !mainStepIds.has(args[0])) {
					errors.push(`Step ${id}: unknown goto target: ${String(args[0])}`);
				}
				break;
			case "finish":
				if (args[0] === null || args[0] === undefined) {
					errors.push(`Step ${id}: finish requires a non-null checkpoint condition`);
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
		checkCondition(recovery.when);
		recovery.steps.forEach((child) => checkStep(child, true));
	}

	return errors;
}
