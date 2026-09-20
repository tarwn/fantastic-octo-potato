import { describe, expect, it } from "vitest";

import { JobType, jobTypeLabel } from "./jobType";

describe("jobTypeLabel", () => {
	it("labels a Training Run job", () => {
		expect(jobTypeLabel({ jobType: JobType.TrainingRun })).toBe("Training Run");
	});

	it("labels a Recipe job by its mode", () => {
		expect(jobTypeLabel({ jobType: JobType.Recipe, details: { mode: "Trial" } })).toBe("Trial");
		expect(jobTypeLabel({ jobType: JobType.Recipe, details: { mode: "Execute" } })).toBe("Execute");
	});
});
