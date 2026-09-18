import { Redactor } from "@redactpii/node";
import type { Page } from "playwright";

interface ScannedElement {
	text: string;
	controlValue: string;
	rect: { left: number; top: number; width: number; height: number };
}

// Independent of the known-secrets pass below — this pass must never replace or gate it. Catches
// on-screen values the Runner has no advance knowledge of. NAME is disabled — it's a greeting-text
// heuristic outside the named pattern set (email/phone/credit-card/SSN); see ADR 0001.
const piiDetector = new Redactor({ rules: { EMAIL: true, PHONE: true, CREDIT_CARD: true, SSN: true, NAME: false } });

function isSensitive(element: { text: string; controlValue: string }, secrets: string[]): boolean {
	const textContainsSecret = element.text !== "" && secrets.some((value) => value !== "" && element.text.includes(value));
	const controlIsSecret = element.controlValue !== "" && secrets.includes(element.controlValue);
	const textHasPii = element.text !== "" && piiDetector.hasPII(element.text);
	const controlHasPii = element.controlValue !== "" && piiDetector.hasPII(element.controlValue);
	return textContainsSecret || controlIsSecret || textHasPii || controlHasPii;
}

// Injects opaque overlay divs over any element whose text/value matches a known secret or a
// third-party-detected PII pattern before taking the screenshot, then removes them — avoids
// pulling in an image-compositing dependency. The sensitivity check runs in Node (not inside
// page.evaluate) so the PII-detection library never has to run in the browser's page context.
export async function takeMaskedScreenshot(page: Page, secrets: string[]): Promise<Buffer> {
	// Filtered in-browser (not just mapped) so non-visual elements and empty leaf nodes never cross
	// the Playwright protocol boundary as part of the per-screenshot scan payload.
	const NON_VISUAL_TAGS = new Set(["SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE"]);
	const elements = await page.evaluate((skipTags: string[]): ScannedElement[] => {
		const skip = new Set(skipTags);
		const results: ScannedElement[] = [];
		document.querySelectorAll("*").forEach((el) => {
			if (skip.has(el.tagName)) {
				return;
			}
			const text = el.textContent?.trim() ?? "";
			const controlValue = (el as HTMLInputElement).value ?? "";
			if (text === "" && controlValue === "") {
				return;
			}
			const rect = el.getBoundingClientRect();
			results.push({ text, controlValue, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
		});
		return results;
	}, [...NON_VISUAL_TAGS]);

	const rectsToMask = elements.filter((element) => isSensitive(element, secrets)).map((element) => element.rect);
	if (rectsToMask.length === 0) {
		return page.screenshot();
	}

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
			overlay.appendChild(patch);
		}
		document.body.appendChild(overlay);
	}, rectsToMask);
	try {
		return await page.screenshot();
	}
	finally {
		await page.evaluate(() => document.getElementById("__dsl_mask_overlay__")?.remove());
	}
}
