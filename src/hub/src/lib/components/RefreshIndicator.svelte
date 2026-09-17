<script lang="ts">
	import type { RefreshIndicatorProps } from "./refreshIndicatorTypes";

	let { intervalSeconds, lastRefreshedOn, onRefresh, class: className }: RefreshIndicatorProps = $props();

	const tickMs = 100;
	let elapsedMs = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;

	function clearTimer() {
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}
	}

	// Restarts from zero whenever the caller passes a new lastRefreshedOn (its own refresh completed).
	$effect(() => {
		void lastRefreshedOn;
		elapsedMs = 0;
		clearTimer();
		timer = setInterval(() => {
			elapsedMs += tickMs;
			if (elapsedMs >= intervalSeconds * 1000) {
				clearTimer();
				onRefresh();
			}
		}, tickMs);

		return clearTimer;
	});

	const remainingFraction = $derived(Math.max(0, 1 - elapsedMs / (intervalSeconds * 1000)));
</script>

<div class={["refresh-indicator", className].filter(Boolean).join(" ")}>
	<span class="refresh-indicator-label">Last refreshed {lastRefreshedOn.toLocaleTimeString()}</span>
	<div class="refresh-indicator-track">
		<div class="refresh-indicator-bar" style:transform={`scaleX(${remainingFraction})`}></div>
	</div>
</div>

<style lang="scss">
	@use "../styles/variables" as *;

	.refresh-indicator {
		display: flex;
		flex-direction: column;
		gap: $space-xs;
	}

	.refresh-indicator-label {
		font-family: $font-family-ui;
		font-size: $text-small-size;
		color: $text-color-muted;
	}

	.refresh-indicator-track {
		width: 100%;
		height: 2px;
		background-color: $border-color-control;
	}

	.refresh-indicator-bar {
		width: 100%;
		height: 100%;
		background-color: $status-running-color;
		transform-origin: left;
	}
</style>
