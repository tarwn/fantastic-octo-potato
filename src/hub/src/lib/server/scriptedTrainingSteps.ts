// Dev-only, fixed stand-in for LLM-directed steps (Training mode only) — no real browser automation or model call backs this.
export interface ScriptedTrainingStep {
	kind: string;
	text: string;
	resultField?: string;
	resultValue?: string;
}

export const SCRIPTED_TRAINING_STEPS: ScriptedTrainingStep[] = [
	{ kind: "step", text: "Open the starting URL" },
	{ kind: "step", text: "Locate the target field" },
	{ kind: "step", text: "Extract the target field", resultField: "example_field", resultValue: "42.00" }
];
