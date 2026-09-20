// Expected, business-level DSL execution failures — the driver returns these as a `failed`
// ActionOutcome rather than throwing, so a calling loop can decide whether to recover or ask a
// human for help. Anything else (a plain Error, a Playwright/browser crash) propagates uncaught.
export type DslErrorCode =
	| "TARGET_NOT_FOUND"
	| "TARGET_AMBIGUOUS"
	| "VERIFY_TIMEOUT"
	| "INVALID_NUMBER"
	| "INVALID_EXTRACTION_PATTERN"
	| "EXTRACTION_NOT_FOUND"
	| "EXTRACTION_AMBIGUOUS"
	| "EXTRACTION_GROUP_NOT_FOUND"
	| "INPUT_NOT_FOUND"
	| "OUTPUT_NOT_ASSIGNED"
	| "NULL_STRING_VALUE"
	| "ACTION_FAILED";

export class DslActionError extends Error {
	readonly code: DslErrorCode;

	constructor(code: DslErrorCode, message: string) {
		super(message);
		this.name = "DslActionError";
		this.code = code;
	}
}
