import type { OutputsState } from "./outputsState.ts";

// Ingredients are the Recipe's inputs, already merged by Hub before dispatch; outputs are the
// collected-so-far output map; resolveCredential resolves a `{ref:"credential"}` name against
// Runner-local env config (RUNNER_CREDENTIAL_<NAME>, see credentials.ts) — never sent by Hub.
export interface ExecutionContext {
	ingredients: Record<string, string | number | boolean>;
	outputs: OutputsState;
	stepTimeoutMs: number;
	resolveCredential: (name: string) => string;
	// The Job's live known-secrets list (grows as sensitive outputs are extracted) — shared by
	// reference so target descriptions are masked against every secret known at that moment.
	secrets: string[];
}
