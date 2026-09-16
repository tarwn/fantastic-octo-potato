import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import RunnersPanel from "./RunnersPanel.svelte";

describe("RunnersPanel", () => {
	it("shows Alive/Idle status and heartbeat when a Runner has no current Job", () => {
		render(RunnersPanel, {
			runners: [{ id: 3, lastHeartbeatOn: null, currentJobId: null }],
			xrefId: 1,
			lastRefreshedOn: new Date(),
			onRefresh: vi.fn()
		});

		expect(screen.getByText("Runner 3")).toBeInTheDocument();
		expect(screen.getByText("Idle")).toBeInTheDocument();
		expect(screen.getByText(/Last heartbeat: Never/)).toBeInTheDocument();
	});

	it("links to the Runner's current Job by its display id when Running", () => {
		render(RunnersPanel, {
			runners: [{ id: 3, lastHeartbeatOn: new Date(), currentJobId: 42 }],
			xrefId: 1,
			lastRefreshedOn: new Date(),
			onRefresh: vi.fn()
		});

		const link = screen.getByRole("link", { name: "Running job-ca1-42" });
		expect(link).toHaveAttribute("href", "/jobs/42");
		expect(screen.queryByText("Idle")).not.toBeInTheDocument();
		expect(screen.queryByText("Alive")).not.toBeInTheDocument();
	});
});
