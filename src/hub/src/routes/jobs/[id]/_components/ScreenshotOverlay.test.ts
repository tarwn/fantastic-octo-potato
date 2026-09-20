import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it, vi } from "vitest";

import ScreenshotOverlay from "./ScreenshotOverlay.svelte";

// jsdom recognizes <dialog> but doesn't implement showModal()/close() (only the
// `open` attribute reflection), so polyfill them for this component's tests.
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

describe("ScreenshotOverlay", () => {
	it("shows the text and the screenshot when open", () => {
		render(ScreenshotOverlay, { open: true, onClose: vi.fn(), text: "click_save: click on button(label='Save')", imageUrl: "/api/hub/jobs/1/artifacts/2" });

		expect(screen.getByText("click_save: click on button(label='Save')")).toBeInTheDocument();
		expect((screen.getByRole("img") as HTMLImageElement).src).toContain("/api/hub/jobs/1/artifacts/2");
	});

	it("renders nothing while closed", () => {
		render(ScreenshotOverlay, { open: false, onClose: vi.fn(), text: "hidden", imageUrl: "/x" });

		expect(screen.queryByText("hidden")).not.toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", async () => {
		const onClose = vi.fn();
		render(ScreenshotOverlay, { open: true, onClose, text: "t", imageUrl: "/x" });

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(onClose).toHaveBeenCalledOnce();
	});
});
