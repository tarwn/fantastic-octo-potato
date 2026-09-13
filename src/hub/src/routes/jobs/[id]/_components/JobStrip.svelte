<script lang="ts">
	import type { JobStrip } from "./jobTypes";

	let { strip }: { strip: JobStrip } = $props();
</script>

<div class="strip">
	<div>
		<div class="strip-label">Customer</div>
		<div class="strip-value strip-value-strong">{strip.customer}</div>
	</div>
	<div>
		<div class="strip-label">Application</div>
		<div class="strip-value">{strip.application}</div>
	</div>
	<div>
		<div class="strip-label">Recipe</div>
		<div class="strip-value strip-recipe">
			<span class="strip-recipe-version">{strip.recipeVersion}</span>
			<span class={`strip-recipe-state strip-recipe-state-${strip.recipeState}`}>{strip.recipeState}</span>
			<button type="button" class="btn-icon" title="View recipe" aria-label="View recipe">
				<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
					<circle cx="6.8" cy="6.8" r="4.3"></circle>
					<path d="M10.2 10.2 L14 14"></path>
				</svg>
			</button>
		</div>
	</div>
	<div>
		<div class="strip-label">Runner</div>
		<div class="strip-value strip-runner">
			{strip.runner} <span class="strip-runner-address">· {strip.runnerAddress}</span>
		</div>
	</div>
	<div class={["strip-status", `strip-status-${strip.status.variant}`]}>
		<div class="strip-label">Status</div>
		<div class="strip-value strip-status-value">
			<span class="strip-status-dot"></span>
			{strip.status.label}
		</div>
	</div>
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.strip {
		@include panel-strip(1.15fr 1fr 0.95fr 1fr 1.05fr);

		margin-top: $space-m;
	}

	.strip-label {
		@include panel-strip-label;
	}

	.strip-value {
		@include panel-strip-value;
	}

	.strip-value-strong {
		font-weight: 700;
	}

	.strip-recipe {
		display: flex;
		align-items: center;
		gap: $space-xs;
	}

	.strip-recipe-state {
		font-size: $text-small-size;
	}

	.strip-recipe-state-released {
		color: $text-color-muted;
	}

	.strip-recipe-state-draft {
		color: $color-ochre-700;
	}

	.btn-icon {
		@include button-icon-bare;
	}

	.strip-runner {
		font-family: $font-family-mono;
		font-size: $text-mono-regular-size;
	}

	.strip-runner-address {
		color: $text-color-muted;
	}

	.strip-status-value {
		display: flex;
		align-items: center;
		gap: $space-xs;
		font-weight: 700;
	}

	.strip-status-dot {
		@include status-dot(currentcolor);
	}

	.strip-status-pending {
		@include panel-strip-status-cell($status-pending-color, $status-pending-surface);
	}

	.strip-status-running {
		@include panel-strip-status-cell($status-running-color, $status-running-surface);
	}

	.strip-status-intervention {
		@include panel-strip-status-cell($status-intervention-color, $status-intervention-surface);
	}

	.strip-status-interactive {
		@include panel-strip-status-cell($status-interactive-color, $status-interactive-surface);
	}

	.strip-status-success {
		@include panel-strip-status-cell($status-success-color, $status-success-surface);
	}

	.strip-status-failed {
		@include panel-strip-status-cell($status-failed-color, $status-failed-surface);
	}

	.strip-status-error {
		@include panel-strip-status-cell($status-error-color, $status-error-surface);
	}

	.strip-status-stale {
		@include panel-strip-status-cell($status-stale-color, $status-stale-surface);
	}

	.strip-status-cancelled {
		@include panel-strip-status-cell($status-cancelled-color, $status-cancelled-surface);
	}
</style>
