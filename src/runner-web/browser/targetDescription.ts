import type { Locator } from "playwright";

import { redactKnownSecrets } from "../textRedaction.ts";

// English description of a Step's existing element target, reported to Hub for the Transcript.
export interface TargetDescription {
	component: string;
	selector: string;
}

export const NO_TARGET_DESCRIPTION: TargetDescription = { component: "element", selector: "" };
export const BROWSER_TARGET_DESCRIPTION: TargetDescription = { component: "browser", selector: "" };

const MAX_SELECTOR_VALUE_LENGTH = 50;

// Most- to least-specific; the first that yields text the masking wouldn't alter wins.
const IDENTIFIERS = [
	{ kind: "id", key: "id" },
	{ kind: "buttonCaption", key: "label" },
	{ kind: "text", key: "text" },
	{ kind: "linkedLabel", key: "label" },
	{ kind: "ancestorLabel", key: "label" }
] as const;

type IdentifierKind = (typeof IDENTIFIERS)[number]["kind"];

// Runs in the browser. Never reads a control's value/contents: label text comes from a clone with
// form controls removed, so a nested <select>'s options or a <textarea>'s text never leak in.
function componentOf(el: Element): string {
	const tag = el.tagName.toLowerCase();
	if (tag === "input") {
		const type = (el as HTMLInputElement).type;
		return ["button", "submit", "reset", "image"].includes(type) ? "button" : `${type} input`;
	}
	const named: Record<string, string> = { select: "Dropdown", button: "button", a: "link", textarea: "textarea" };
	return named[tag] ?? "element";
}

// Runs in the browser.
function identifierOf(el: Element, kind: IdentifierKind): string {
	const clean = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();
	const labelText = (label: Element): string => {
		const clone = label.cloneNode(true) as Element;
		clone.querySelectorAll("input,select,textarea").forEach((control) => control.remove());
		return clean(clone.textContent);
	};
	const tag = el.tagName.toLowerCase();
	const isFormControl = ["input", "select", "textarea"].includes(tag);
	const isButtonInput = tag === "input" && ["button", "submit", "reset", "image"].includes((el as HTMLInputElement).type);

	switch (kind) {
		case "id":
			return el.id;
		case "buttonCaption":
			if (tag === "button") {
				return clean((el as HTMLElement).innerText);
			}
			return isButtonInput ? clean((el as HTMLInputElement).value) : "";
		case "text":
			return isFormControl ? "" : clean((el as HTMLElement).innerText);
		case "linkedLabel": {
			const linked = isFormControl && el.id !== "" ? Array.from(document.querySelectorAll("label")).find((label) => label.htmlFor === el.id) : undefined;
			return linked ? labelText(linked) : "";
		}
		case "ancestorLabel": {
			const ancestor = isFormControl ? el.closest("label") : null;
			return ancestor ? labelText(ancestor) : "";
		}
	}
}

// Page-derived text can carry PII, so a value the Runner's text masking would change is skipped
// rather than reported — the chain continues to the next identifier, ending empty.
export async function describeTarget(locator: Locator, secrets: string[]): Promise<TargetDescription> {
	const component = await locator.evaluate(componentOf);
	for (const { kind, key } of IDENTIFIERS) {
		const value = await locator.evaluate(identifierOf, kind);
		if (value !== "" && redactKnownSecrets(value, secrets) === value) {
			return { component, selector: `${key}='${value.slice(0, MAX_SELECTOR_VALUE_LENGTH)}'` };
		}
	}
	return { component, selector: "" };
}
