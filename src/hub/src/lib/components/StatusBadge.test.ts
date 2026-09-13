import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import StatusBadge from "./StatusBadge.svelte";

describe("StatusBadge", () => {
	it("renders the default status text", () => {
		render(StatusBadge);

		expect(screen.getByTestId("status-badge")).toHaveTextContent("Hub status: ready");
	});

	it("renders a provided status", () => {
		render(StatusBadge, { status: "degraded" });

		expect(screen.getByTestId("status-badge")).toHaveTextContent("Hub status: degraded");
	});
});
