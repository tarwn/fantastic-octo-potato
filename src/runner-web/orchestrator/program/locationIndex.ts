import type { ChildStep, Step } from "../../dsl/types.ts";

export type Location =
	| { level: "top"; topIndex: number }
	| { level: "child"; topIndex: number; array: ChildStep[]; childIndex: number };

// Indexes every Step id (top-level and one level of group/if children) to where it lives, so
// `goto` can jump anywhere and reconstruct the right continuation without re-evaluating an
// enclosing `if`'s guard.
export function buildLocationIndex(steps: Step[]): Map<string, Location> {
	const index = new Map<string, Location>();
	steps.forEach((step, topIndex) => {
		index.set(step.id, { level: "top", topIndex });
		if (step.action === "group") {
			const children = step.args[0];
			children.forEach((child, childIndex) => index.set(child.id, { level: "child", topIndex, array: children, childIndex }));
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			for (const ifCase of cases) {
				ifCase.steps.forEach((child, childIndex) => index.set(child.id, { level: "child", topIndex, array: ifCase.steps, childIndex }));
			}
			elseSteps.forEach((child, childIndex) => index.set(child.id, { level: "child", topIndex, array: elseSteps, childIndex }));
		}
	});
	return index;
}
