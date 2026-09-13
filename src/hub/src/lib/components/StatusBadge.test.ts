import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import StatusBadge from "./StatusBadge.svelte";

describe("StatusBadge", () => {
	it("renders the given text", () => {
		render(StatusBadge, { text: "Running" });

		expect(screen.getByTestId("status-badge")).toHaveTextContent("Running");
	});

	it("defaults to the running variant", () => {
		render(StatusBadge, { text: "Running" });

		expect(screen.getByTestId("status-badge")).toHaveClass("status-badge-running");
	});

	it("applies a provided variant", () => {
		render(StatusBadge, { text: "Intervention-Requested", variant: "intervention" });

		expect(screen.getByTestId("status-badge")).toHaveClass("status-badge-intervention");
	});
});
