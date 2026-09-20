import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";

import ScreenshotPanel from "./ScreenshotPanel.svelte";

import type { JobStepArtifact } from "$lib/types/job";

// jsdom recognizes <dialog> but doesn't implement showModal()/close(), so polyfill them.
beforeAll(() => {
	if (!HTMLDialogElement.prototype.showModal) {
		HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
			this.setAttribute("open", "");
		};
	}
	if (!HTMLDialogElement.prototype.close) {
		HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
			this.removeAttribute("open");
			this.dispatchEvent(new Event("close"));
		};
	}
});

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

	it("opens the larger view from the View larger button", async () => {
		render(ScreenshotPanel, { jobId: 42, artifacts: [{ id: 2, stepId: "complete", createdAt: new Date() }] });

		await fireEvent.click(screen.getByRole("button", { name: "View larger" }));

		expect(screen.getAllByRole("img")).toHaveLength(2);
	});

	it("offers no View larger button without a screenshot", () => {
		render(ScreenshotPanel, { jobId: 1, artifacts: [] });

		expect(screen.queryByRole("button", { name: "View larger" })).not.toBeInTheDocument();
	});
});
