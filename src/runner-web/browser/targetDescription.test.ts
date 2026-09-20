import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { describeTarget } from "./targetDescription.ts";

const PAGE_HTML = `<!doctype html>
<body>
	<button id="save">Save</button>
	<button id="secret-id-button">Pay</button>
	<button>Cancel</button>
	<a href="#next">Next page</a>
	<label for="email">Email address</label>
	<input id="email" type="email" value="typed@example.com" />
	<label>Search term <input type="search" value="typed-search" /></label>
	<input type="text" class="bare" value="typed-bare" />
	<select class="wrapped"><option>Checking</option></select>
	<label>Account type <select class="labelled-select"><option>Checking</option></select></label>
	<div class="plain"></div>
	<span class="caption">Balance due</span>
	<input type="submit" class="submit-input" value="Send it" />
	<label>${"long ".repeat(40)}<input class="long-label" /></label>
</body>`;

let fixture: FixtureBrowser;

beforeAll(async () => {
	fixture = await openFixturePage();
	await fixture.page.setContent(PAGE_HTML);
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
});

function describeCss(selector: string, secrets: string[] = []) {
	return describeTarget(fixture.page.locator(selector), secrets);
}

describe("describeTarget: component", () => {
	it("names an input by its type", async () => {
		expect((await describeCss("#email")).component).toBe("email input");
		expect((await describeCss(".bare")).component).toBe("text input");
	});

	it("names a select a Dropdown", async () => {
		expect((await describeCss(".wrapped")).component).toBe("Dropdown");
	});

	it("names a button and a link", async () => {
		expect((await describeCss("button >> text=Cancel")).component).toBe("button");
		expect((await describeCss("a")).component).toBe("link");
	});

	it("names a button-type input a button", async () => {
		expect((await describeCss(".submit-input")).component).toBe("button");
	});

	it("falls back to element for an unmapped tag", async () => {
		expect((await describeCss(".plain")).component).toBe("element");
	});
});

describe("describeTarget: selector", () => {
	it("prefers the id", async () => {
		expect(await describeCss("#save")).toEqual({ component: "button", selector: "id='save'" });
	});

	it("uses a button's label when it has no id", async () => {
		expect((await describeCss("button >> text=Cancel")).selector).toBe("label='Cancel'");
	});

	it("uses a button-type input's caption", async () => {
		expect((await describeCss(".submit-input")).selector).toBe("label='Send it'");
	});

	it("uses inner text for a non-form element such as a span", async () => {
		expect(await describeCss(".caption")).toEqual({ component: "element", selector: "text='Balance due'" });
	});

	it("uses a link's inner text when it has no id", async () => {
		expect((await describeCss("a")).selector).toBe("text='Next page'");
	});

	it("uses the label linked by for= when the input's id is masked", async () => {
		await fixture.page.evaluate(() => {
			document.querySelector("#email")!.id = "acct-5551";
			document.querySelector("label[for=email]")!.setAttribute("for", "acct-5551");
		});
		expect(await describeCss("#acct-5551", ["5551"])).toEqual({ component: "email input", selector: "label='Email address'" });
	});

	it("uses the nearest ancestor label without including the control's own contents", async () => {
		expect((await describeCss("input[type=search]")).selector).toBe("label='Search term'");
		expect((await describeCss(".labelled-select")).selector).toBe("label='Account type'");
	});

	it("is empty when nothing identifies the element", async () => {
		expect((await describeCss(".bare")).selector).toBe("");
	});

	it("never includes a value typed into a control", async () => {
		const { selector } = await describeCss(".bare");
		expect(selector).not.toContain("typed-bare");
		const searchSelector = (await describeCss("input[type=search]")).selector;
		expect(searchSelector).not.toContain("typed-search");
	});

	it("truncates a long candidate", async () => {
		const { selector } = await describeCss(".long-label");
		expect(selector.length).toBeLessThanOrEqual(80);
		expect(selector.startsWith("label='long long")).toBe(true);
	});
});

describe("describeTarget: masking", () => {
	it("skips a candidate that contains a known secret and continues down the chain", async () => {
		await fixture.page.evaluate(() => {
			const button = document.querySelector("#secret-id-button")!;
			button.id = "token-abc123";
		});
		const description = await describeCss("#token-abc123", ["abc123"]);
		expect(description).toEqual({ component: "button", selector: "label='Pay'" });
	});

	it("ends empty when every candidate would be masked", async () => {
		const description = await describeCss("#token-abc123", ["abc123", "Pay"]);
		expect(description).toEqual({ component: "button", selector: "" });
	});
});
