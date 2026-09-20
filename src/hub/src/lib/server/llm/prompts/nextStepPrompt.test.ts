import { describe, expect, it } from "vitest";

import { NEXT_STEP_SYSTEM_PROMPT } from "./nextStepPrompt";

describe("NEXT_STEP_SYSTEM_PROMPT", () => {
	it("includes the shared DSL section unchanged", () => {
		expect(NEXT_STEP_SYSTEM_PROMPT).toMatchSnapshot();
	});
});
