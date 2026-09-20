import { describe, expect, it } from "vitest";

import { NEXT_STEP_SYSTEM_PROMPT } from "./nextStepPrompt";

describe("NEXT_STEP_SYSTEM_PROMPT", () => {
	it("teaches the structured read with the read_amount example", () => {
		expect(NEXT_STEP_SYSTEM_PROMPT).toContain("\"id\": \"read_amount\"");
		expect(NEXT_STEP_SYSTEM_PROMPT).toContain("\"exact\": false");
		expect(NEXT_STEP_SYSTEM_PROMPT).toContain("Never embed observed values in the pattern");
	});

	it("includes the shared DSL section unchanged", () => {
		expect(NEXT_STEP_SYSTEM_PROMPT).toMatchSnapshot();
	});
});
