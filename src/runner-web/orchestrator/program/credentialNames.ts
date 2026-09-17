import type { ChildStep, RecipeDefinition } from "../../dsl/types.ts";

function isValueRef(value: unknown): value is { ref: string; name: string } {
	return typeof value === "object" && value !== null && "ref" in value;
}

function visitValue(names: Set<string>, value: unknown): void {
	if (isValueRef(value) && value.ref === "credential") {
		names.add(value.name);
	}
}

function visitChild(names: Set<string>, step: ChildStep): void {
	switch (step.action) {
		case "open":
			visitValue(names, step.args[0]);
			break;
		case "fill":
			visitValue(names, step.args[1]);
			break;
		case "select":
			for (const option of step.args[1]) {
				visitValue(names, option.value);
			}
			break;
		case "assign":
			visitValue(names, step.args[1]);
			break;
		default:
			break;
	}
}

function visitChildren(names: Set<string>, children: ChildStep[]): void {
	for (const child of children) {
		visitChild(names, child);
	}
}

// Walks the whole program (including recoveries) for every `{ref:"credential"}` reference, so
// their resolved values can be masked out of screenshots even though nothing on the wire ever
// tells the Runner which credential names a Recipe uses ahead of time.
export function collectCredentialNames(recipe: RecipeDefinition): Set<string> {
	const names = new Set<string>();
	for (const step of recipe.steps) {
		if (step.action === "group") {
			visitChildren(names, step.args[0]);
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			for (const ifCase of cases) {
				visitChildren(names, ifCase.steps);
			}
			visitChildren(names, elseSteps);
		}
		else {
			visitChild(names, step);
		}
	}
	for (const recovery of recipe.recoveries) {
		visitChildren(names, recovery.steps);
	}
	return names;
}
