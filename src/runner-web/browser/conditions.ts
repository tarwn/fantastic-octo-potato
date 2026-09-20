import type { Page } from "playwright";

import { DslActionError } from "../dsl/errors.ts";
import type { ExecutionContext } from "../dsl/executionContext.ts";
import { isAssigned } from "../dsl/outputsState.ts";
import type { AtomicCondition, Condition } from "../dsl/types.ts";

import { resolveElementTarget, resolveTargetValue } from "./targetResolver.ts";

// "exists" is true for any number of matches — presence alone is enough, so it never needs an
// ambiguity check. The other state tests (visible/enabled/disabled) do need exactly one match to
// answer meaningfully: zero matches is a plain `false`, but 2+ matches can't be answered at all.
async function evaluateAtomic(page: Page, condition: AtomicCondition, ctx: ExecutionContext): Promise<boolean> {
	if (condition.test === "assigned") {
		return isAssigned(ctx.outputs, condition.args[0].name);
	}

	const element = condition.args[0];
	if (element.by === "point") {
		throw new DslActionError("ACTION_FAILED", `"${condition.test}" does not support point targets`);
	}
	const target = resolveTargetValue(element, ctx);

	if (condition.test === "exists") {
		return (await resolveElementTarget(page, target)).status !== "missing";
	}

	const resolution = await resolveElementTarget(page, target);
	if (resolution.status === "missing") {
		return false;
	}
	if (resolution.status === "ambiguous") {
		throw new DslActionError("TARGET_AMBIGUOUS", `Condition "${condition.test}" matched ${resolution.count} elements, expected exactly one`);
	}

	switch (condition.test) {
		case "visible":
			return resolution.locator.isVisible();
		case "enabled":
			return resolution.locator.isEnabled();
		case "disabled":
			return resolution.locator.isDisabled();
	}
}

function isAtomicCondition(condition: Condition): condition is AtomicCondition {
	return condition.test !== "all" && condition.test !== "any";
}

export async function evaluateCondition(page: Page, condition: Condition, ctx: ExecutionContext): Promise<boolean> {
	if (isAtomicCondition(condition)) {
		return evaluateAtomic(page, condition, ctx);
	}
	if (condition.test === "all") {
		for (const sub of condition.args) {
			if (!(await evaluateAtomic(page, sub, ctx))) {
				return false;
			}
		}
		return true;
	}
	for (const sub of condition.args) {
		if (await evaluateAtomic(page, sub, ctx)) {
			return true;
		}
	}
	return false;
}
