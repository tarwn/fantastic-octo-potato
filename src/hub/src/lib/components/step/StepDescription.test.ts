import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import StepDescription from "./StepDescription.svelte";

import type { ChildStep, Step } from "$lib/types/recipeDefinition";

function description(step: Step): HTMLElement {
	render(StepDescription, { step });
	return screen.getAllByTestId("step-description")[0];
}

const save = { by: "text", value: "Save" } as const;

describe("StepDescription", () => {
	it.each<[string, Step, string]>([
		["open", { id: "s", action: "open", args: ["https://x.test"] }, "open https://x.test"],
		["click element", { id: "s", action: "click", args: [save] }, "click text \"Save\""],
		["click point", { id: "s", action: "click", args: [{ by: "point", x: 1, y: 2 }] }, "click 1,2"],
		["focus", { id: "s", action: "focus", args: [save] }, "focus text \"Save\""],
		["scrollIntoView", { id: "s", action: "scrollIntoView", args: [save] }, "scrollIntoView text \"Save\""],
		["scroll", { id: "s", action: "scroll", args: [0, 300] }, "scroll 0,300"],
		["fill", { id: "s", action: "fill", args: [save, { ref: "input", name: "q" }] }, "fill text \"Save\" from input: q"],
		["select", { id: "s", action: "select", args: [save, [{ by: "label", value: "Red" }]] }, "select text \"Save\" label Red"],
		["read", { id: "s", action: "read", args: [save, "text", { ref: "output", name: "o" }] }, "read text \"Save\" to output: o"],
		["assign", { id: "s", action: "assign", args: [{ ref: "output", name: "o" }, 5] }, "assign output: o from 5"],
		["goto", { id: "s", action: "goto", args: ["done"] }, "goto done"],
		["fail", { id: "s", action: "fail", args: ["CODE", "broke"] }, "fail CODE: broke"],
		["finish unconditional", { id: "s", action: "finish", args: [null] }, "finish"]
	])("describes %s", (_name, step, expected) => {
		expect(description(step).textContent?.replace(/\s+/g, " ").trim()).toBe(expected);
	});

	it.each(["check", "verify"] as const)("describes %s with its condition in a wrapper", (action) => {
		const step: ChildStep = { id: "s", action, args: [{ test: "visible", args: [save] }] };

		const el = description(step);

		expect(el).toHaveTextContent(`${action}:`);
		expect(screen.getByTestId("step-condition-wrapper")).toHaveTextContent("visible text \"Save\"");
	});

	it("describes a conditional finish with its condition", () => {
		const el = description({ id: "s", action: "finish", args: [{ test: "exists", args: [save] }] });

		expect(el).toHaveTextContent("finish when:");
		expect(screen.getByTestId("step-condition-wrapper")).toHaveTextContent("exists text \"Save\"");
	});

	it("lists a group's child steps", () => {
		description({ id: "g", action: "group", args: [[{ id: "a", action: "goto", args: ["x"] }, { id: "b", action: "goto", args: ["y"] }]] });

		expect(screen.getAllByTestId("step-description")).toHaveLength(3);
	});

	it("lists an if's cases and else steps", () => {
		description({
			id: "i",
			action: "if",
			args: [[{ when: { test: "exists", args: [save] }, steps: [{ id: "a", action: "goto", args: ["x"] }] }], [{ id: "b", action: "goto", args: ["y"] }]]
		});

		expect(screen.getByTestId("step-if-case")).toHaveTextContent("if");
		expect(screen.getByTestId("step-else")).toHaveTextContent("else");
		expect(screen.getAllByTestId("step-description")).toHaveLength(3);
	});

	it("crashes on an action it has no description for", () => {
		expect(() => render(StepDescription, { step: { id: "s", action: "teleport", args: [] } as unknown as Step })).toThrow("teleport");
	});

	it("omits the else block when there are no else steps", () => {
		description({ id: "i", action: "if", args: [[{ when: { test: "exists", args: [save] }, steps: [] }], []] });

		expect(screen.queryByTestId("step-else")).toBeNull();
	});
});
