import { SensitivityType } from "./db/sensitivityType";

// Dev-only, fixed stand-in for LLM-directed steps (Training mode only) — no real browser automation or model call backs this.
// sensitivityType is explicit per resultField since a Training Job has no Recipe to declare field sensitivity from.
export interface ScriptedTrainingStep {
	kind: string;
	text: string;
	resultField?: string;
	resultValue?: string;
	sensitivityType?: SensitivityType;
}

export const SCRIPTED_TRAINING_STEPS: ScriptedTrainingStep[] = [
	{ kind: "step", text: "navigate to starting URL" },
	{ kind: "step", text: "extract sample_field", resultField: "sample_field", resultValue: "sample-value", sensitivityType: SensitivityType.None }
];
