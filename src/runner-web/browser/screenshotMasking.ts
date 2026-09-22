import { Redactor } from "@redactpii/node";
import type { Page } from "playwright";

import { log } from "../logger.ts";

interface ScannedElement {
	text: string;
	controlValue: string;
	rect: { left: number; top: number; width: number; height: number };
}

// Independent of the known-secrets pass below — this pass must never replace or gate it. Catches
// on-screen values the Runner has no advance knowledge of. NAME is disabled — it's a greeting-text
// heuristic outside the named pattern set (email/phone/credit-card/SSN); see ADR 0001.
const piiDetector = new Redactor({ rules: { EMAIL: true, PHONE: true, CREDIT_CARD: true, SSN: true, NAME: false } });

function isSensitive(element: { text: string; controlValue: string }, secrets: string[], skipPiiPass: boolean): boolean {
	const textContainsSecret = element.text !== "" && secrets.some((value) => value !== "" && element.text.includes(value));
	const controlIsSecret = element.controlValue !== "" && secrets.includes(element.controlValue);
	if (skipPiiPass) {
		return textContainsSecret || controlIsSecret;
	}
	const textHasPii = element.text !== "" && piiDetector.hasPII(element.text);
	const controlHasPii = element.controlValue !== "" && piiDetector.hasPII(element.controlValue);
	return textContainsSecret || controlIsSecret || textHasPii || controlHasPii;
}

// Injects opaque overlay divs over any element whose text/value matches a known secret or a
// third-party-detected PII pattern before taking the screenshot, then removes them — avoids
// pulling in an image-compositing dependency. The sensitivity check runs in Node (not inside
// page.evaluate) so the PII-detection library never has to run in the browser's page context.
// `skipPiiPass` (set from Training's operator-confirmed "this data is synthetic" flag) only ever
// disables the third-party PII-detection pass — the known-secrets scrub above always still applies.
// Always captures the full scrollable page, not just the viewport — steps-dsl.md's point target
// and the compiled Recipe's artifact coordinates are both defined relative to the full-page image.
export async function takeMaskedScreenshot(page: Page, jobId: number, secrets: string[], skipPiiPass = false): Promise<Buffer> {
	// Filtered in-browser (not just mapped) so non-visual elements and empty leaf nodes never cross
	// the Playwright protocol boundary as part of the per-screenshot scan payload.
	const NON_VISUAL_TAGS = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE"]);
	const elements = await page.evaluate((skipTags: string[]): ScannedElement[] => {
		const skip = new Set(skipTags);
		const results: ScannedElement[] = [];
		// `el.textContent` pulls every descendant's text too, so a container (body, a wrapper div)
		// would otherwise inherit its children's sensitive text and get its own — often full-page —
		// rect masked along with theirs. Only an element's own direct text nodes count here.
		const ownText = (el: Element): string => {
			let text = "";
			for (const node of el.childNodes) {
				if (node.nodeType === Node.TEXT_NODE) {
					text += node.textContent;
				}
			}
			return text.trim();
		};
		document.querySelectorAll("*").forEach((el) => {
			if (skip.has(el.tagName)) {
				return;
			}
			const text = ownText(el);
			const controlValue = (el as HTMLInputElement).value ?? "";
			if (text === "" && controlValue === "") {
				return;
			}
			const rect = el.getBoundingClientRect();
			results.push({ text, controlValue, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
		});
		return results;
	}, [...NON_VISUAL_TAGS]);

	const rectsToMask = elements.filter((element) => isSensitive(element, secrets, skipPiiPass)).map((element) => element.rect);
	if (rectsToMask.length === 0) {
		return page.screenshot({ fullPage: true });
	}

	// Debug aid for diagnosing whether an unexpectedly blank/masked screenshot is real redaction
	// (and where) versus some other screenshot failure.
	const rectDescriptions = rectsToMask
		.map((rect) => `x=${rect.left} y=${rect.top} width=${rect.width} height=${rect.height}`)
		.join(", ");
	log(`job ${jobId}: redacting ${rectsToMask.length} element(s) from screenshot: ${rectDescriptions}`);

	await page.evaluate((rects: ScannedElement["rect"][]) => {
		const overlay = document.createElement("div");
		overlay.id = "__dsl_mask_overlay__";
		for (const rect of rects) {
			const patch = document.createElement("div");
			patch.style.position = "fixed";
			patch.style.left = `${rect.left}px`;
			patch.style.top = `${rect.top}px`;
			patch.style.width = `${rect.width}px`;
			patch.style.height = `${rect.height}px`;
			patch.style.background = "black";
			patch.style.zIndex = "2147483647";
			patch.style.display = "flex";
			patch.style.alignItems = "center";
			patch.style.justifyContent = "center";
			patch.style.overflow = "hidden";
			patch.style.color = "white";
			patch.style.fontSize = "12px";
			patch.textContent = "REDACTED";
			overlay.appendChild(patch);
		}
		document.body.appendChild(overlay);
	}, rectsToMask);
	try {
		return await page.screenshot({ fullPage: true });
	}
	finally {
		await page.evaluate(() => document.getElementById("__dsl_mask_overlay__")?.remove());
	}
}
