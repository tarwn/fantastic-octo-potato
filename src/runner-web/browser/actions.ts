import type { ElementHandle, Locator, Page } from "playwright";

import { DslActionError } from "../dsl/errors.ts";
import type { ExecutionContext } from "../dsl/executionContext.ts";
import { extractFromText, validateReadSpec } from "../dsl/extraction.ts";
import { setOutput } from "../dsl/outputsState.ts";
import type { ChildStep, ReadSpec, ScalarValue, TargetElement } from "../dsl/types.ts";
import { resolveStringValue, resolveValue } from "../dsl/valueResolver.ts";
import { redactKnownSecrets } from "../textRedaction.ts";

import { evaluateCondition } from "./conditions.ts";
import { BROWSER_TARGET_DESCRIPTION, describeSubstringTextTarget, describeTarget, NO_TARGET_DESCRIPTION, type TargetDescription } from "./targetDescription.ts";
import { isPointTarget, resolveElementAtPoint, resolveElementTarget, resolveTargetValue, resolveViewportPoint } from "./targetResolver.ts";

// A step reports exactly one of these; `kind: "businessFailure"` distinguishes the `fail` action's
// deliberate stop-the-Job outcome from an ordinary technical/resolution failure that a calling
// loop may still recover from or escalate to asking a human for help.
export interface ActionOutcome {
	outcome: "succeeded" | "failed";
	kind?: "businessFailure";
	extraction?: { fieldName: string; value: ScalarValue };
	checked?: boolean;
	gotoStepId?: string;
	finished?: boolean;
	error?: { code: string; message: string };
	targetDescription: TargetDescription;
}

type ActionResult = Omit<ActionOutcome, "targetDescription">;

const POLL_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Described before the action runs — a click can navigate away, leaving nothing to describe.
async function resolveRequiredLocator(page: Page, element: TargetElement, ctx: ExecutionContext, described: { value: TargetDescription }): Promise<Locator> {
	const target = resolveTargetValue(element, ctx);
	const shownValue = redactKnownSecrets(target.value, ctx.secrets);
	const resolution = await resolveElementTarget(page, target);
	if (resolution.status === "missing") {
		throw new DslActionError("TARGET_NOT_FOUND", `No element matched {by: "${target.by}", value: "${shownValue}"}`);
	}
	if (resolution.status === "ambiguous") {
		throw new DslActionError("TARGET_AMBIGUOUS", `${resolution.count} elements matched {by: "${target.by}", value: "${shownValue}"}, expected exactly one`);
	}
	described.value = target.by === "text" && target.exact === false
		? await describeSubstringTextTarget(resolution.locator, target.value, ctx.secrets)
		: await describeTarget(resolution.locator, ctx.secrets);
	return resolution.locator;
}

type ReadMode = "text" | "value" | "number" | ReadSpec;

// The capture is deliberately never echoed on a bad number: it is page-derived text.
function applyReadSpec(raw: string, spec: ReadSpec): ScalarValue {
	const captured = extractFromText(raw, spec);
	return spec.parse === "number" ? parseNumberText(captured, false) : captured;
}

async function readElementValue(locator: Locator, mode: ReadMode): Promise<ScalarValue> {
	if (typeof mode !== "string") {
		return applyReadSpec(mode.source === "text" ? await locator.innerText() : await locator.inputValue(), mode);
	}
	if (mode === "text") {
		return locator.innerText();
	}
	if (mode === "value") {
		return locator.inputValue();
	}
	// number: prefer the control's own value (an input/select), falling back to displayed text.
	const raw = await locator.inputValue().catch(() => locator.innerText());
	return parseNumberText(raw);
}

function parseNumberText(raw: string, echoValue = true): ScalarValue {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return null;
	}
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) {
		throw new DslActionError("INVALID_NUMBER", echoValue ? `"${trimmed}" could not be converted to a number` : "The extracted value could not be converted to a number");
	}
	return parsed;
}

function readControlValue(element: ElementHandle<Element>): Promise<string | undefined> {
	return element.evaluate((el) => {
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
			return el.value;
		}
		return undefined;
	});
}

async function readRequiredControlValue(element: ElementHandle<Element>, point: { x: number; y: number }): Promise<string> {
	const value = await readControlValue(element);
	if (value === undefined) {
		throw new DslActionError("TARGET_NOT_FOUND", `No value-bearing control at point (${point.x}, ${point.y})`);
	}
	return value;
}

// Point reads use textContent (no <br> newlines, unlike innerText): a known limit of extraction at a point.
async function readAtPoint(page: Page, point: { by: "point"; x: number; y: number }, mode: ReadMode): Promise<ScalarValue> {
	const element = await resolveElementAtPoint(page, point);
	if (!element) {
		throw new DslActionError("TARGET_NOT_FOUND", `No element at point (${point.x}, ${point.y})`);
	}
	try {
		if (typeof mode !== "string") {
			const raw = mode.source === "value" ? await readRequiredControlValue(element, point) : await element.evaluate((el) => el.textContent ?? "");
			return applyReadSpec(raw, mode);
		}
		if (mode === "value") {
			return await readRequiredControlValue(element, point);
		}
		// number: prefer the control's own value where the point resolved to one (an input/select
		// showing "1234.50"), otherwise fall back to the element's displayed text.
		if (mode === "number") {
			const controlValue = await readControlValue(element);
			return parseNumberText(controlValue ?? (await element.evaluate((el) => el.textContent ?? "")));
		}
		return element.evaluate((el) => el.textContent ?? "");
	}
	finally {
		await element.dispose();
	}
}

async function executeVerify(page: Page, step: Extract<ChildStep, { action: "verify" }>, ctx: ExecutionContext): Promise<ActionResult> {
	const deadline = Date.now() + ctx.stepTimeoutMs;
	for (;;) {
		if (await evaluateCondition(page, step.args[0], ctx)) {
			return { outcome: "succeeded" };
		}
		if (Date.now() >= deadline) {
			return { outcome: "failed", error: { code: "VERIFY_TIMEOUT", message: `Condition did not become true within ${ctx.stepTimeoutMs}ms` } };
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

// Dispatches one non-structural Step (group/if branching/child continuation is a calling loop's
// job, not this driver's). Known/expected failures (missing or ambiguous target, verify timeout,
// an unparsable number) are caught and returned as a `failed` outcome; anything else propagates
// uncaught, since it's not a failure this driver knows how to characterize.
export async function executeAction(page: Page, step: ChildStep, ctx: ExecutionContext): Promise<ActionOutcome> {
	const described = { value: NO_TARGET_DESCRIPTION };
	const result = await runAction(page, step, ctx, described);
	return { ...result, targetDescription: described.value };
}

async function runAction(page: Page, step: ChildStep, ctx: ExecutionContext, described: { value: TargetDescription }): Promise<ActionResult> {
	try {
		switch (step.action) {
			case "open": {
				described.value = BROWSER_TARGET_DESCRIPTION;
				await page.goto(resolveStringValue(step.args[0], ctx));
				return { outcome: "succeeded" };
			}
			case "click": {
				const target = step.args[0];
				if (isPointTarget(target)) {
					const { viewportX, viewportY } = await resolveViewportPoint(page, target);
					await page.mouse.click(viewportX, viewportY);
				}
				else {
					await (await resolveRequiredLocator(page, target, ctx, described)).click();
				}
				return { outcome: "succeeded" };
			}
			case "focus": {
				await (await resolveRequiredLocator(page, step.args[0], ctx, described)).focus();
				return { outcome: "succeeded" };
			}
			case "fill": {
				const locator = await resolveRequiredLocator(page, step.args[0], ctx, described);
				await locator.fill(resolveStringValue(step.args[1], ctx));
				return { outcome: "succeeded" };
			}
			case "select": {
				const locator = await resolveRequiredLocator(page, step.args[0], ctx, described);
				const options = step.args[1].map((option) => ({ [option.by]: resolveStringValue(option.value, ctx) }));
				await locator.selectOption(options);
				return { outcome: "succeeded" };
			}
			case "scrollIntoView": {
				await (await resolveRequiredLocator(page, step.args[0], ctx, described)).scrollIntoViewIfNeeded();
				return { outcome: "succeeded" };
			}
			case "scroll": {
				const [deltaX, deltaY] = step.args;
				await page.mouse.wheel(deltaX, deltaY);
				// Chromium applies a wheel-driven scroll asynchronously — mouse.wheel() resolves
				// before the resulting scrollTop/scrollY change is observable, so give it a beat.
				await page.waitForTimeout(50);
				return { outcome: "succeeded" };
			}
			case "read": {
				const [target, mode, destination] = step.args;
				if (typeof mode !== "string") {
					validateReadSpec(mode);
				}
				const value = isPointTarget(target) ? await readAtPoint(page, target, mode) : await readElementValue(await resolveRequiredLocator(page, target, ctx, described), mode);
				setOutput(ctx.outputs, destination.name, value);
				return { outcome: "succeeded", extraction: { fieldName: destination.name, value } };
			}
			case "check": {
				const checked = await evaluateCondition(page, step.args[0], ctx);
				return { outcome: "succeeded", checked };
			}
			case "verify":
				return await executeVerify(page, step, ctx);
			case "assign": {
				const [destination, value] = step.args;
				const resolved = resolveValue(value, ctx);
				setOutput(ctx.outputs, destination.name, resolved);
				return { outcome: "succeeded", extraction: { fieldName: destination.name, value: resolved } };
			}
			case "goto":
				return { outcome: "succeeded", gotoStepId: step.args[0] };
			case "finish": {
				const condition = step.args[0];
				const finished = condition === null ? true : await evaluateCondition(page, condition, ctx);
				return { outcome: "succeeded", finished };
			}
			case "fail": {
				const [code, message] = step.args;
				return { outcome: "failed", kind: "businessFailure", error: { code, message } };
			}
		}
	}
	catch (err: unknown) {
		if (err instanceof DslActionError) {
			return { outcome: "failed", error: { code: err.code, message: err.message } };
		}
		// Playwright throws its own Error for actionability timeouts/navigation failures once a
		// target has already resolved to exactly one element — attempting the action is how this
		// driver checks interactability, so that failure is an ordinary reported outcome, not a crash.
		if (err instanceof Error) {
			return { outcome: "failed", error: { code: "ACTION_FAILED", message: err.message } };
		}
		throw err;
	}
}
