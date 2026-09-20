import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import TargetDescription from "./TargetDescription.svelte";

describe("TargetDescription", () => {
	it("renders an element target with its locator kind and value", () => {
		render(TargetDescription, { locator: { by: "label", value: "Email" } });

		expect(screen.getByTestId("target-element")).toHaveTextContent("label \"Email\"");
	});

	it("renders a point target as coordinates", () => {
		render(TargetDescription, { locator: { by: "point", x: 10, y: 20 } });

		expect(screen.getByTestId("target-point")).toHaveTextContent("10,20");
	});
});
