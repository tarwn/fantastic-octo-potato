import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ConditionDescription from "./ConditionDescription.svelte";

describe("ConditionDescription", () => {
	it("renders a target test as '{test} {locator}'", () => {
		render(ConditionDescription, { condition: { test: "visible", args: [{ by: "text", value: "Save" }] } });

		expect(screen.getByTestId("condition")).toHaveTextContent("visible text \"Save\"");
	});

	it("renders an assigned test with its output", () => {
		render(ConditionDescription, { condition: { test: "assigned", args: [{ ref: "output", name: "total" }] } });

		expect(screen.getByTestId("condition")).toHaveTextContent("assigned output: total");
	});

	it("renders a composite as a labelled stack of its conditions", () => {
		render(ConditionDescription, {
			condition: {
				test: "any",
				args: [
					{ test: "exists", args: [{ by: "css", value: ".a" }] },
					{ test: "enabled", args: [{ by: "css", value: ".b" }] }
				]
			}
		});

		expect(screen.getByTestId("condition-composite")).toHaveTextContent("any of");
		expect(screen.getAllByTestId("condition")).toHaveLength(2);
	});
});
