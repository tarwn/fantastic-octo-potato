import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import JobStrip from "./JobStrip.svelte";

import { JobStatus } from "$lib/jobStatus";

describe("JobStrip", () => {
	it.each([
		[JobStatus.InterventionRequested, "intervention"],
		[JobStatus.CompletedError, "error"]
	])("styles the Status cell for status %s with the %s variant", (jobStatusId, variant) => {
		const { container } = render(JobStrip, { customerName: "Acme", applicationName: "BambooInvoice", runnerId: null, jobStatusId });

		expect(container.querySelector(`.strip-status-${variant}`)).not.toBeNull();
	});
});
