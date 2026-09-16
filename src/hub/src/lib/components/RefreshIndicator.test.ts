import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RefreshIndicator from "./RefreshIndicator.svelte";

describe("RefreshIndicator", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows the last-refreshed time", () => {
		const lastRefreshedOn = new Date("2026-09-15T09:00:00.000Z");

		render(RefreshIndicator, { intervalSeconds: 5, lastRefreshedOn, onRefresh: vi.fn() });

		expect(screen.getByText(`Last refreshed ${lastRefreshedOn.toLocaleTimeString()}`)).toBeInTheDocument();
	});

	it("invokes onRefresh once the interval elapses", async () => {
		const onRefresh = vi.fn();
		render(RefreshIndicator, { intervalSeconds: 5, lastRefreshedOn: new Date(), onRefresh });

		await vi.advanceTimersByTimeAsync(5000);

		expect(onRefresh).toHaveBeenCalledOnce();
	});

	it("does not invoke onRefresh before the interval elapses", async () => {
		const onRefresh = vi.fn();
		render(RefreshIndicator, { intervalSeconds: 5, lastRefreshedOn: new Date(), onRefresh });

		await vi.advanceTimersByTimeAsync(4000);

		expect(onRefresh).not.toHaveBeenCalled();
	});

	it("restarts the countdown once the caller passes an updated lastRefreshedOn", async () => {
		const onRefresh = vi.fn();
		const { rerender } = render(RefreshIndicator, { intervalSeconds: 5, lastRefreshedOn: new Date("2026-09-15T09:00:00.000Z"), onRefresh });

		await vi.advanceTimersByTimeAsync(4000);
		await rerender({ intervalSeconds: 5, lastRefreshedOn: new Date("2026-09-15T09:00:04.000Z"), onRefresh });
		await vi.advanceTimersByTimeAsync(4000);

		expect(onRefresh).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1000);

		expect(onRefresh).toHaveBeenCalledOnce();
	});
});
