import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ValueDescription from "./ValueDescription.svelte";

describe("ValueDescription", () => {
	it("renders a string as plain text", () => {
		render(ValueDescription, { value: "hello" });

		expect(screen.getByTestId("value-plain")).toHaveTextContent("hello");
	});

	it("renders a number, boolean and null as plain text", () => {
		const { rerender } = render(ValueDescription, { value: 5 });
		expect(screen.getByTestId("value-plain")).toHaveTextContent("5");

		rerender({ value: false });
		expect(screen.getByTestId("value-plain")).toHaveTextContent("false");

		rerender({ value: null });
		expect(screen.getByTestId("value-plain")).toHaveTextContent("null");
	});

	it("renders an input ref", () => {
		render(ValueDescription, { value: { ref: "input", name: "invoice" } });

		expect(screen.getByTestId("value-input")).toHaveTextContent("input: invoice");
	});

	it("renders a credential ref", () => {
		render(ValueDescription, { value: { ref: "credential", name: "login" } });

		expect(screen.getByTestId("value-credential")).toHaveTextContent("cred: login");
	});

	it("renders an output ref", () => {
		render(ValueDescription, { value: { ref: "output", name: "total" } });

		expect(screen.getByTestId("value-output")).toHaveTextContent("output: total");
	});
});
