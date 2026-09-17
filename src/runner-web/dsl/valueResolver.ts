import { DslActionError } from "./errors.ts";
import type { ExecutionContext } from "./executionContext.ts";
import { getOutput } from "./outputsState.ts";
import type { ScalarValue, StringValue, Value, ValueRef } from "./types.ts";

function isValueRef(value: Value | StringValue): value is ValueRef {
	return value !== null && typeof value === "object";
}

// A Value is a scalar or a `{ref: ...}` reference. An ingredient that was never provided and an
// output that was never assigned both fail loudly here rather than falling back to undefined —
// the caller (actions.ts) turns a DslActionError into a reported `failed` outcome.
export function resolveValue(value: Value, ctx: ExecutionContext): ScalarValue {
	if (!isValueRef(value)) {
		return value;
	}

	switch (value.ref) {
		case "input": {
			if (!Object.prototype.hasOwnProperty.call(ctx.ingredients, value.name)) {
				throw new DslActionError("INPUT_NOT_FOUND", `Input "${value.name}" was not provided`);
			}
			return ctx.ingredients[value.name];
		}
		case "output":
			return getOutput(ctx.outputs, value.name);
		case "credential":
			// Not caught as a DslActionError — a missing credential env var is a Runner
			// configuration bug, not a Job-level failure, so it crashes loudly instead.
			return ctx.resolveCredential(value.name);
	}
}

export function resolveStringValue(value: StringValue, ctx: ExecutionContext): string {
	const resolved = isValueRef(value) ? resolveValue(value, ctx) : value;
	if (resolved === null) {
		throw new DslActionError("NULL_STRING_VALUE", "Resolved a null value where a string was required");
	}
	return typeof resolved === "string" ? resolved : String(resolved);
}
