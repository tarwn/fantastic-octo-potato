import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import StartTrainingModal from "./StartTrainingModal.svelte";

import { goto } from "$app/navigation";
import { startTrainingRun } from "$lib/api/jobsApi";
import { JobType } from "$lib/jobType";

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
			jobType: JobType.TrainingRun,
			name: "Training Run",
			jobStatusId: 1,
			details: {
				goal: "Extract invoices",
				startingUrl: "https://example.com",
				allowlist: "https://example.com",
				maxSteps: 10,
				alternateGoals: [],
				syntheticDataConfirmed: false,
				stepTimeoutMs: 15000
			},
			runnerId: null,
			createdAt: new Date(),
			startedAt: null,
			heartbeatOn: null,
			completedAt: null,
			interventionOwner: null,
			blockedStepId: null,
			blockedReason: null,
			resumeStepId: null
		});
	});

	it("shows goal, starting URL, and maximum steps fields when open", () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		expect(screen.getByLabelText(/primary goal/i)).toBeInTheDocument();
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

		await fireEvent.input(screen.getByLabelText(/primary goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "not-a-url" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(await screen.findByText(/valid url/i)).toBeInTheDocument();
	});

	it("shows a positive-integer message for a non-positive maximum steps value", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		await fireEvent.input(screen.getByLabelText(/primary goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "0" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(await screen.findByText(/positive whole number/i)).toBeInTheDocument();
	});

	it("shows no validation messages once all fields are valid", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		await fireEvent.input(screen.getByLabelText(/primary goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/valid url/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/positive whole number/i)).not.toBeInTheDocument();
	});

	it("submits the Training Run and navigates to the new Job's detail page", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 7 });

		await fireEvent.input(screen.getByLabelText(/primary goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(startTrainingRun).toHaveBeenCalledWith(7, {
			goal: "Extract invoices",
			startingUrl: "https://example.com",
			maxSteps: 10,
			alternateGoals: [],
			syntheticDataConfirmed: false
		});
		expect(goto).toHaveBeenCalledWith("/jobs/42");
	});

	it("includes alternate goals and the synthetic-data confirmation when submitted", async () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 7 });

		await fireEvent.input(screen.getByLabelText(/primary goal/i), { target: { value: "Extract invoices" } });
		await fireEvent.input(screen.getByLabelText(/starting url/i), { target: { value: "https://example.com" } });
		await fireEvent.input(screen.getByLabelText(/maximum steps/i), { target: { value: "10" } });
		await fireEvent.input(screen.getByLabelText(/alternate goals/i), { target: { value: "Also capture the due date\n\nAlso capture the vendor" } });
		await fireEvent.click(screen.getByLabelText(/synthetic/i));
		await fireEvent.click(screen.getByRole("button", { name: /start/i }));

		expect(startTrainingRun).toHaveBeenCalledWith(7, {
			goal: "Extract invoices",
			startingUrl: "https://example.com",
			maxSteps: 10,
			alternateGoals: ["Also capture the due date", "Also capture the vendor"],
			syntheticDataConfirmed: true
		});
	});

	it("shows a server error inline instead of navigating when the submit call fails", async () => {
		vi.mocked(startTrainingRun).mockRejectedValue(new Error("Registered Application 7 not found"));
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 7 });

		await fireEvent.input(screen.getByLabelText(/primary goal/i), { target: { value: "Extract invoices" } });
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

	it("pre-fills every field from initialValues when given", () => {
		render(StartTrainingModal, {
			open: true,
			onClose: vi.fn(),
			registeredApplicationId: 1,
			initialValues: {
				goal: "Extract invoices",
				startingUrl: "https://example.com/start",
				maxSteps: 12,
				alternateGoals: ["Find totals", "List clients"],
				syntheticDataConfirmed: true
			}
		});

		expect(screen.getByLabelText(/primary goal/i)).toHaveValue("Extract invoices");
		expect(screen.getByLabelText(/starting url/i)).toHaveValue("https://example.com/start");
		expect(screen.getByLabelText(/maximum steps/i)).toHaveValue("12");
		expect(screen.getByLabelText(/alternate goals/i)).toHaveValue("Find totals\nList clients");
		expect(screen.getByLabelText(/synthetic/i)).toBeChecked();
	});

	it("leaves every field blank when no initialValues are given", () => {
		render(StartTrainingModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1 });

		expect(screen.getByLabelText(/primary goal/i)).toHaveValue("");
		expect(screen.getByLabelText(/starting url/i)).toHaveValue("");
		expect(screen.getByLabelText(/maximum steps/i)).toHaveValue("");
		expect(screen.getByLabelText(/alternate goals/i)).toHaveValue("");
		expect(screen.getByLabelText(/synthetic/i)).not.toBeChecked();
	});
});
