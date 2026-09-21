import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import TargetDescription from "./TargetDescription.svelte";

describe("TargetDescription", () => {
	it.each([
		[false, "text containing \"Amount:\""],
		[true, "text \"Amount:\""],
		[undefined, "text \"Amount:\""]
	])("renders a text target with exact=%s as %s", (exact, expected) => {
		render(TargetDescription, { locator: { by: "text", value: "Amount:", exact } });

		expect(screen.getByTestId("target-element").textContent?.replace(/\s+/g, " ").trim()).toBe(expected);
	});

	it("renders an element target with its locator kind and value", () => {
		render(TargetDescription, { locator: { by: "label", value: "Email" } });

		expect(screen.getByTestId("target-element")).toHaveTextContent("label \"Email\"");
	});

	it("renders an element target whose value is an input reference", () => {
		render(TargetDescription, { locator: { by: "text", value: { ref: "input", name: "invoiceNumber" } } });

		expect(screen.getByTestId("target-element")).toHaveTextContent("text");
		expect(screen.getByTestId("value-input")).toHaveTextContent("input: invoiceNumber");
	});

	it("renders a point target as coordinates", () => {
		render(TargetDescription, { locator: { by: "point", x: 10, y: 20 } });

		expect(screen.getByTestId("target-point")).toHaveTextContent("10,20");
	});
});
