import { describe, expect, it } from "vitest";

import type { ChildStep, RecipeDefinition } from "../../dsl/types.ts";

import { collectCredentialNames } from "./credentialNames.ts";

function recipe(steps: RecipeDefinition["steps"], recoveries: RecipeDefinition["recoveries"] = []): RecipeDefinition {
	return { schemaVersion: 1, inputs: {}, outputs: {}, steps, recoveries };
}

describe("collectCredentialNames", () => {
	it("collects a credential reference used by a top-level fill Step", () => {
		const step: ChildStep = { id: "s1", action: "fill", args: [{ by: "css", value: "#u" }, { ref: "credential", name: "username" }] };

		expect(collectCredentialNames(recipe([step]))).toEqual(new Set(["username"]));
	});

	it("collects credential references from open, select, and assign Steps, ignoring non-credential refs", () => {
		const steps: RecipeDefinition["steps"] = [
			{ id: "s1", action: "open", args: [{ ref: "credential", name: "startUrl" }] },
			{ id: "s2", action: "select", args: [{ by: "css", value: "#type" }, [{ by: "value", value: { ref: "credential", name: "accountType" } }]] },
			{ id: "s3", action: "assign", args: [{ ref: "output", name: "out" }, { ref: "credential", name: "secret" }] },
			{ id: "s4", action: "assign", args: [{ ref: "output", name: "out2" }, { ref: "input", name: "notACredential" }] }
		];

		expect(collectCredentialNames(recipe(steps))).toEqual(new Set(["startUrl", "accountType", "secret"]));
	});

	it("collects credential references from group children, if case/else children, and recoveries", () => {
		const groupChild: ChildStep = { id: "groupChild", action: "fill", args: [{ by: "css", value: "#a" }, { ref: "credential", name: "fromGroup" }] };
		const caseChild: ChildStep = { id: "caseChild", action: "fill", args: [{ by: "css", value: "#b" }, { ref: "credential", name: "fromCase" }] };
		const elseChild: ChildStep = { id: "elseChild", action: "fill", args: [{ by: "css", value: "#c" }, { ref: "credential", name: "fromElse" }] };
		const recoveryChild: ChildStep = { id: "recoveryChild", action: "fill", args: [{ by: "css", value: "#d" }, { ref: "credential", name: "fromRecovery" }] };

		const steps: RecipeDefinition["steps"] = [
			{ id: "group1", action: "group", args: [[groupChild]] },
			{ id: "if1", action: "if", args: [[{ when: { test: "exists", args: [{ by: "css", value: "#a" }] }, steps: [caseChild] }], [elseChild]] }
		];
		const recoveries: RecipeDefinition["recoveries"] = [
			{ id: "r1", description: "", when: { test: "exists", args: [{ by: "css", value: "#a" }] }, steps: [recoveryChild] }
		];

		expect(collectCredentialNames(recipe(steps, recoveries))).toEqual(new Set(["fromGroup", "fromCase", "fromElse", "fromRecovery"]));
	});

	it("returns an empty set for a Recipe with no credential references", () => {
		const step: ChildStep = { id: "s1", action: "click", args: [{ by: "css", value: "#go" }] };

		expect(collectCredentialNames(recipe([step]))).toEqual(new Set());
	});
});
