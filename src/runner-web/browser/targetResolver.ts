import type { ElementHandle, Locator, Page } from "playwright";

import type { Target, TargetElement, TargetPoint } from "../dsl/types.ts";

// Actions that operate on a single element need exactly one match — missing and ambiguous (2+
// matches) are distinct, reported outcomes, never a silent first-match pick.
export type TargetResolution = { status: "found"; locator: Locator } | { status: "missing" } | { status: "ambiguous"; count: number };

export function isPointTarget(target: Target): target is TargetPoint {
	return target.by === "point";
}

function toLocator(page: Page, target: TargetElement): Locator {
	switch (target.by) {
		case "text":
			return page.getByText(target.value, { exact: true });
		case "label":
			return page.getByLabel(target.value, { exact: true });
		case "placeholder":
			return page.getByPlaceholder(target.value, { exact: true });
		case "css":
			return page.locator(target.value);
	}
}

export async function resolveElementTarget(page: Page, target: TargetElement): Promise<TargetResolution> {
	const locator = toLocator(page, target);
	const count = await locator.count();
	if (count === 0) {
		return { status: "missing" };
	}
	if (count > 1) {
		return { status: "ambiguous", count };
	}
	return { status: "found", locator: locator.first() };
}

export interface ViewportPoint {
	viewportX: number;
	viewportY: number;
}

// Point x/y are full-page screenshot coordinates, not viewport coordinates — scroll the point
// into the middle of the viewport, then translate to viewport-relative coordinates Playwright's
// mouse/DOM APIs expect.
export async function resolveViewportPoint(page: Page, point: TargetPoint): Promise<ViewportPoint> {
	await page.evaluate((y: number) => window.scrollTo(0, Math.max(0, y - window.innerHeight / 2)), point.y);
	const scrollY = await page.evaluate(() => window.scrollY);
	return { viewportX: point.x, viewportY: point.y - scrollY };
}

// Resolves the HTML element at a full-page point for `read`'s point target. A point that lands on
// a canvas or other element with no HTML value to read is out of scope for this POC.
export async function resolveElementAtPoint(page: Page, point: TargetPoint): Promise<ElementHandle<Element> | undefined> {
	const { viewportX, viewportY } = await resolveViewportPoint(page, point);
	const handle = await page.evaluateHandle(
		(args: { x: number; y: number }) => document.elementFromPoint(args.x, args.y),
		{ x: viewportX, y: viewportY }
	);
	const element = handle.asElement();
	return element ?? undefined;
}
