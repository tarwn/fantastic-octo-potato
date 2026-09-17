import type { Page } from "playwright";

// Injects opaque overlay divs over any element whose text/value matches a known secret before
// taking the screenshot, then removes them — avoids pulling in an image-compositing dependency.
export async function takeMaskedScreenshot(page: Page, secrets: string[]): Promise<Buffer> {
	if (secrets.length === 0) {
		return page.screenshot();
	}
	await page.evaluate((values: string[]) => {
		const overlay = document.createElement("div");
		overlay.id = "__dsl_mask_overlay__";
		document.querySelectorAll("*").forEach((el) => {
			const text = el.textContent?.trim() ?? "";
			const controlValue = (el as HTMLInputElement).value;
			const textContainsSecret = text !== "" && values.some((value) => value !== "" && text.includes(value));
			if (textContainsSecret || (controlValue && values.includes(controlValue))) {
				const rect = el.getBoundingClientRect();
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
		});
		document.body.appendChild(overlay);
	}, secrets);
	try {
		return await page.screenshot();
	}
	finally {
		await page.evaluate(() => document.getElementById("__dsl_mask_overlay__")?.remove());
	}
}
