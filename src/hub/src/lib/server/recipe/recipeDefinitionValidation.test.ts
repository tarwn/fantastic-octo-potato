import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validateAtomicStep, validateRecipeDefinition } from "./recipeDefinitionValidation";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

const examplesPath = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "docs", "todos", "supporting-docs", "examples.json");
const examples = JSON.parse(readFileSync(examplesPath, "utf-8")) as { recipe: { definition: RecipeDefinition } };
const validDefinition = examples.recipe.definition;

function withSteps(steps: RecipeDefinition["steps"]): RecipeDefinition {
	return { ...validDefinition, steps };
}

describe("validateRecipeDefinition", () => {
	it("accepts the steps-dsl.md example definition", () => {
		expect(validateRecipeDefinition(validDefinition)).toEqual([]);
	});

	it("rejects a duplicate step id across main steps", () => {
		const errors = validateRecipeDefinition(
			withSteps([
				{ id: "dup", action: "open", args: [{ ref: "input", name: "startUrl" }] },
				{ id: "dup", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }] }
			])
		);

		expect(errors).toContain("Duplicate step id: dup");
	});

	it("rejects a duplicate id shared between a main step and a recovery", () => {
		const errors = validateRecipeDefinition({
			...validDefinition,
			steps: [{ id: "start", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }] }],
			recoveries: [{ id: "start", description: "dup", when: { test: "visible", args: [{ by: "css", value: "#x" }] }, steps: [] }]
		});

		expect(errors).toContain("Duplicate step id: start");
	});

	it("rejects an unknown input reference", () => {
		const errors = validateRecipeDefinition(withSteps([{ id: "s1", action: "open", args: [{ ref: "input", name: "doesNotExist" }] }]));

		expect(errors).toContain("Unknown input reference: doesNotExist");
	});

	it("rejects an unknown output reference", () => {
		const errors = validateRecipeDefinition(
			withSteps([{ id: "s1", action: "assign", args: [{ ref: "output", name: "doesNotExist" }, "value"] }])
		);

		expect(errors).toContain("Unknown output reference: doesNotExist");
	});

	it("rejects an unknown goto target", () => {
		const errors = validateRecipeDefinition(withSteps([{ id: "s1", action: "goto", args: ["missing_step"] }]));

		expect(errors).toContain("Step s1: unknown goto target: missing_step");
	});

	it("rejects an invalid action", () => {
		const errors = validateRecipeDefinition(withSteps([{ id: "s1", action: "hover", args: [] } as unknown as RecipeDefinition["steps"][number]]));

		expect(errors).toContain("Step s1: invalid action: hover");
	});

	it("rejects an invalid target 'by' value", () => {
		const errors = validateRecipeDefinition(
			withSteps([{ id: "s1", action: "click", args: [{ by: "xpath", value: "//button" } as never] }])
		);

		expect(errors).toContain("Invalid target 'by' value: xpath");
	});

	it("rejects an invalid condition test", () => {
		const errors = validateRecipeDefinition(
			withSteps([{ id: "s1", action: "verify", args: [{ test: "hidden", args: [] } as never] }])
		);

		expect(errors).toContain("Invalid condition test: hidden");
	});

	it("rejects a group nested inside another group", () => {
		const errors = validateRecipeDefinition(
			withSteps([
				{
					id: "outer",
					action: "group",
					args: [[{ id: "inner", action: "group", args: [[]] }]]
				} as unknown as RecipeDefinition["steps"][number]
			])
		);

		expect(errors).toContain("Step inner: nested group/if is not allowed beyond one level");
	});

	it("rejects a nested composite condition inside all/any", () => {
		const errors = validateRecipeDefinition(
			withSteps([
				{
					id: "s1",
					action: "verify",
					args: [{ test: "all", args: [{ test: "any", args: [] } as never] }]
				}
			])
		);

		expect(errors).toContain("Nested composite condition not allowed: any");
	});

	it("rejects a finish Step with a null checkpoint", () => {
		const errors = validateRecipeDefinition(withSteps([{ id: "s1", action: "finish", args: [null] }]));

		expect(errors).toContain("Step s1: finish requires a non-null checkpoint condition");
	});

	it("rejects a reference to an unknown credential, since the model must never guess a name", () => {
		const errors = validateRecipeDefinition(
			withSteps([{ id: "s1", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "guessed" }] }])
		);

		expect(errors).toContain("Unknown credential reference: guessed");
	});

	it("accepts a reference to a known credential", () => {
		const errors = validateRecipeDefinition(
			withSteps([{ id: "s1", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "loginUser" }] }]),
			new Set(["loginUser"])
		);

		expect(errors).toEqual([]);
	});

	it("rejects a read Step whose destination is not one of the full Recipe's declared outputs, unlike a Training atomic Step", () => {
		const errors = validateRecipeDefinition(
			withSteps([{ id: "s1", action: "read", args: [{ by: "css", value: "h3" }, "text", { ref: "output", name: "notDeclared" }] }])
		);

		expect(errors).toContain("Unknown output reference: notDeclared");
	});
});

describe("validateAtomicStep", () => {
	it("accepts a valid atomic Step referencing a known input", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "fill", args: [{ by: "label", value: "Account number" }, { ref: "input", name: "accountNumber" }] },
			new Set(["accountNumber"]),
			new Set()
		);

		expect(errors).toEqual([]);
	});

	it("accepts a finish Step with a null checkpoint (Training finish may use null)", () => {
		const errors = validateAtomicStep({ id: "s1", action: "finish", args: [null] }, new Set(), new Set());

		expect(errors).toEqual([]);
	});

	it("rejects a group Step (atomic-only, no group/if)", () => {
		const errors = validateAtomicStep({ id: "s1", action: "group", args: [[]] }, new Set(), new Set());

		expect(errors).toContain("Step s1: nested group/if is not allowed beyond one level");
	});

	it("rejects an if Step (atomic-only, no group/if)", () => {
		const errors = validateAtomicStep({ id: "s1", action: "if", args: [[], []] }, new Set(), new Set());

		expect(errors).toContain("Step s1: nested group/if is not allowed beyond one level");
	});

	it("rejects an unknown action", () => {
		const errors = validateAtomicStep({ id: "s1", action: "teleport", args: [] }, new Set(), new Set());

		expect(errors).toContain("Step s1: invalid action: teleport");
	});

	it("rejects a reference to an unknown input", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "fill", args: [{ by: "label", value: "Account number" }, { ref: "input", name: "missing" }] },
			new Set(),
			new Set()
		);

		expect(errors).toContain("Unknown input reference: missing");
	});

	it("rejects a goto Step, since a Training Step has no named main Steps to jump to", () => {
		const errors = validateAtomicStep({ id: "s1", action: "goto", args: ["somewhere"] }, new Set(), new Set());

		expect(errors).toContain("Step s1: unknown goto target: somewhere");
	});

	it("accepts a read Step whose destination names a brand-new output, since a destination creates it rather than referencing one", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "read", args: [{ by: "css", value: "h3" }, "text", { ref: "output", name: "clientName" }] },
			new Set(),
			new Set()
		);

		expect(errors).toEqual([]);
	});

	it("accepts an assign Step whose destination names a brand-new output", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "assign", args: [{ ref: "output", name: "clientName" }, "value"] },
			new Set(),
			new Set()
		);

		expect(errors).toEqual([]);
	});

	it("still rejects a bad reference in an assign Step's value even though its destination is exempt", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "assign", args: [{ ref: "output", name: "clientName" }, { ref: "output", name: "doesNotExist" }] },
			new Set(),
			new Set()
		);

		expect(errors).toContain("Unknown output reference: doesNotExist");
	});

	it("accepts a reference to a known credential", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "loginUser" }] },
			new Set(),
			new Set(),
			new Set(["loginUser"])
		);

		expect(errors).toEqual([]);
	});

	it("rejects a reference to an unknown credential, since the model must never guess a name", () => {
		const errors = validateAtomicStep(
			{ id: "s1", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "guessed" }] },
			new Set(),
			new Set(),
			new Set(["loginUser"])
		);

		expect(errors).toContain("Unknown credential reference: guessed");
	});
});
