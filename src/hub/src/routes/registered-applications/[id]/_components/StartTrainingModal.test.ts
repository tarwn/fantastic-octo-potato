import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import StartTrainingModal from "./StartTrainingModal.svelte";

import { goto } from "$app/navigation";
import { startTrainingRun } from "$lib/api/jobsApi";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/api/jobsApi", () => ({ startTrainingRun: vi.fn() }));

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

describe("StartTrainingModal", () => {
	beforeEach(() => {
		vi.mocked(startTrainingRun).mockReset();
		vi.mocked(goto).mockReset();
		vi.mocked(startTrainingRun).mockResolvedValue({
			id: 42,
			customerApplicationXrefId: 1,
			mode: "training",
			jobStatusId: 1,
			goal: "Extract invoices",
			startingUrl: "https://example.com",
			allowlist: "https://example.com",
			maxSteps: 10,
			runnerId: null,
			createdAt: new Date(),
			startedAt: null,
			heartbeatOn: null,
			completedAt: null
		});
	});

	it("shows goal, starting URL, and maximum steps fields when open", () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		expect(screen.getByLabelText(/goal/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/starting url/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/maximum steps/i)).toBeInTheDocument();
	});

	it("shows a required message for each field on empty submit", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(await screen.findAllByText(/required/i)).toHaveLength(3);
	});

	it("shows an invalid-URL message for a non-URL starting URL value", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		await fireEvent.input(screen.getByLabelText(/goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "not-a-url" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(await screen.findByText(/valid url/i)).toBeInTheDocument();
	});

	it("shows a positive-integer message for a non-positive maximum steps value", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		await fireEvent.input(screen.getByLabelText(/goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "0" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(await screen.findByText(/positive whole number/i)).toBeInTheDocument();
	});

	it("shows no validation messages once all fields are valid", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		await fireEvent.input(screen.getByLabelText(/goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/valid url/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/positive whole number/i)).not.toBeInTheDocument();
	});

	it("submits the Training Run and navigates to the new Job's detail page", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 7 });

		await fireEvent.input(screen.getByLabelText(/goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(startTrainingRun).toHaveBeenCalledWith(7, {
			goal: "Extract invoices",
			startingUrl: "https://example.com",
			maxSteps: 10
		});
		expect(goto).toHaveBeenCalledWith("/jobs/42");
	});

	it("shows a server error inline instead of navigating when the submit call fails", async () => {
		vi.mocked(startTrainingRun).mockRejectedValue(new Error("Registered Application 7 not found"));
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 7 });

		await fireEvent.input(screen.getByLabelText(/goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(await screen.findByText("Registered Application 7 not found")).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it("calls onClose when the cancel button is clicked", async () => {
		const onClose = vi.fn();
		render(StartTrainingModal, { open: true, onClose, registeredApplicationId: 1 });

		await fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		expect(onClose).toHaveBeenCalledOnce();
	});
});
