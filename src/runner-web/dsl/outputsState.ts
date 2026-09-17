import { DslActionError } from "./errors.ts";
import type { ScalarValue } from "./types.ts";

// A Map lets us distinguish "never assigned" (has() === false) from "assigned null" (has() ===
// true, get() === null), which a plain object keyed by name/undefined can't.
export type OutputsState = Map<string, ScalarValue>;

export function createOutputsState(): OutputsState {
	return new Map();
}

export function isAssigned(outputs: OutputsState, name: string): boolean {
	return outputs.has(name);
}

export function getOutput(outputs: OutputsState, name: string): ScalarValue {
	if (!outputs.has(name)) {
		throw new DslActionError("OUTPUT_NOT_ASSIGNED", `Output "${name}" has not been assigned yet`);
	}
	return outputs.get(name) as ScalarValue;
}

export function setOutput(outputs: OutputsState, name: string, value: ScalarValue): void {
	outputs.set(name, value);
}
