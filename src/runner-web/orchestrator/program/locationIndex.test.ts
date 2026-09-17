import { describe, expect, it } from "vitest";

import type { ChildStep, Step } from "../../dsl/types.ts";

import { buildLocationIndex } from "./locationIndex.ts";

function clickStep(id: string): ChildStep {
	return { id, action: "click", args: [{ by: "css", value: `#${id}` }] };
}

describe("buildLocationIndex", () => {
	it("indexes top-level Steps by their position", () => {
		const steps: Step[] = [clickStep("s1"), clickStep("s2")];

		const index = buildLocationIndex(steps);

		expect(index.get("s1")).toEqual({ level: "top", topIndex: 0 });
		expect(index.get("s2")).toEqual({ level: "top", topIndex: 1 });
	});

	it("indexes a group's children against their parent's top index and child array", () => {
		const children: ChildStep[] = [clickStep("child1"), clickStep("child2")];
		const steps: Step[] = [{ id: "group1", action: "group", args: [children] }];

		const index = buildLocationIndex(steps);

		expect(index.get("group1")).toEqual({ level: "top", topIndex: 0 });
		expect(index.get("child1")).toEqual({ level: "child", topIndex: 0, array: children, childIndex: 0 });
		expect(index.get("child2")).toEqual({ level: "child", topIndex: 0, array: children, childIndex: 1 });
	});

	it("indexes an if's case and else children against the if's top index", () => {
		const caseSteps: ChildStep[] = [clickStep("caseChild")];
		const elseSteps: ChildStep[] = [clickStep("elseChild")];
		const steps: Step[] = [
			{ id: "if1", action: "if", args: [[{ when: { test: "exists", args: [{ by: "css", value: "#a" }] }, steps: caseSteps }], elseSteps] }
		];

		const index = buildLocationIndex(steps);

		expect(index.get("if1")).toEqual({ level: "top", topIndex: 0 });
		expect(index.get("caseChild")).toEqual({ level: "child", topIndex: 0, array: caseSteps, childIndex: 0 });
		expect(index.get("elseChild")).toEqual({ level: "child", topIndex: 0, array: elseSteps, childIndex: 0 });
	});
});
