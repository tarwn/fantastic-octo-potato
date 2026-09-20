import { afterEach, describe, expect, it, vi } from "vitest";

import { getOperatorId } from "./operatorId";

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("getOperatorId", () => {
	it("creates an id once and reuses it from browser storage", () => {
		const first = getOperatorId();

		expect(first).not.toBe("");
		expect(getOperatorId()).toBe(first);
		expect(localStorage.getItem("hub.operatorId")).toBe(first);
	});

	it("falls back to a stable in-memory id when browser storage is unavailable", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			}
		});

		const id = getOperatorId();

		expect(id).not.toBe("");
		expect(getOperatorId()).toBe(id);
	});
});
