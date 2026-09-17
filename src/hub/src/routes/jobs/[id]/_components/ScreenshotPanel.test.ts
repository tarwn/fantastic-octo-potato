import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ScreenshotPanel from "./ScreenshotPanel.svelte";

import type { JobStepArtifact } from "$lib/types/job";

describe("ScreenshotPanel", () => {
	it("shows a message when there are no artifacts yet", () => {
		render(ScreenshotPanel, { jobId: 1, artifacts: [] });

		expect(screen.getByText("No screenshot yet.")).toBeInTheDocument();
	});

	it("shows the most recently reported artifact's image, served through the artifacts endpoint", () => {
		const artifacts: JobStepArtifact[] = [
			{ id: 1, stepId: "start", createdAt: new Date("2026-09-17T00:00:00.000Z") },
			{ id: 2, stepId: "complete", createdAt: new Date("2026-09-17T00:00:05.000Z") }
		];

		render(ScreenshotPanel, { jobId: 42, artifacts });

		const image = screen.getByRole("img") as HTMLImageElement;
		expect(image.src).toContain("/api/hub/jobs/42/artifacts/2");
	});
});
