<script lang="ts">
	import type { TranscriptDay } from "./jobTypes";

	import RedactedValue from "$lib/components/RedactedValue.svelte";
	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import type { StatusVariant } from "$lib/components/statusVariants";

	let { meta, days }: { meta: string; days: TranscriptDay[] } = $props();

	const emphasizedRailVariants: StatusVariant[] = ["running", "intervention", "success"];

	function railClass(variant: StatusVariant | undefined): string {
		return variant && emphasizedRailVariants.includes(variant) ? `transcript-rail-${variant}` : "transcript-rail";
	}
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Transcript</h2>
		<span class="panel-meta">{meta}</span>
	</div>
	{#each days as day (day.dateLabel)}
		<div class="transcript-date">{day.dateLabel}</div>
		<div class="transcript transcript-rows">
			{#each day.entries as entry (entry.time + entry.text)}
				<div
					class={[`transcript-row transcript-row-${entry.kind}`, entry.screenshot && "transcript-row-interactive"]
						.filter(Boolean)
						.join(" ")}
				>
					{#if entry.statusChange}
						<span class={railClass(entry.statusChange.variant)}></span>
					{:else}
						<span></span>
					{/if}
					<span class="transcript-time">{entry.time}</span>
					<span class="transcript-kind">{entry.kind.toUpperCase()}</span>
					<span class="transcript-text">
						{entry.text}
						{#if entry.redacted}
							<RedactedValue value={entry.redacted} />
						{/if}
						{#if entry.pii}
							<span class="redacted-tag">PII</span>
						{/if}
					</span>
					{#if entry.statusChange}
						<StatusBadge text={entry.statusChange.label} variant={entry.statusChange.variant} />
					{:else if entry.screenshot}
						<button type="button" class="btn-icon" title="View screenshot" aria-label="View screenshot">
							<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1"></rect>
								<circle cx="8" cy="8" r="2.2"></circle>
							</svg>
						</button>
					{:else}
						<span></span>
					{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.panel {
		@include panel;
	}

	.panel-header {
		@include panel-header;
	}

	.panel-meta {
		@include panel-header-meta;
	}

	.transcript-date {
		@include transcript-date-row;
	}

	.transcript {
		@include transcript;
	}

	.transcript-rows {
		@include transcript-rows;
	}

	.transcript-rail {
		@include transcript-rail;
	}

	.transcript-rail-running {
		@include transcript-rail($status-running-color);
	}

	.transcript-rail-intervention {
		@include transcript-rail($status-intervention-color);
	}

	.transcript-rail-success {
		@include transcript-rail($status-success-color);
	}

	.transcript-time {
		@include transcript-cell-time;
	}

	.transcript-row {
		@include transcript-row;

		&-status .transcript-kind {
			@include transcript-cell-kind($transcript-kind-status-color);
		}

		&-step .transcript-kind {
			@include transcript-cell-kind($transcript-kind-step-color);
		}

		&-recover {
			.transcript-kind {
				@include transcript-cell-kind($transcript-kind-recover-color);
			}

			.transcript-text {
				color: $transcript-kind-recover-text-color;
			}
		}

		&-info {
			.transcript-kind {
				@include transcript-cell-kind($transcript-kind-info-color);
			}

			.transcript-text {
				color: $transcript-kind-info-color;
			}
		}

		&-halt {
			@include transcript-row-emphasis($transcript-kind-halt-surface, $transcript-kind-halt-border-color);

			.transcript-kind {
				@include transcript-cell-kind($transcript-kind-halt-color);
			}

			.transcript-text {
				color: $transcript-kind-halt-text-color;
			}
		}

		&-plan,
		&-observe {
			.transcript-kind {
				@include transcript-cell-kind($transcript-kind-plan-color);
			}

			.transcript-text {
				color: $transcript-kind-plan-text-color;
			}
		}

		&-terminal {
			@include transcript-row-emphasis($transcript-kind-terminal-surface, $transcript-kind-terminal-border-color);

			.transcript-kind {
				@include transcript-cell-kind($status-success-color);
			}

			.transcript-text {
				color: $status-success-color;
			}
		}
	}

	.transcript-row-interactive {
		@include transcript-row-interactive;
	}

	.transcript-text {
		@include transcript-cell-text;
	}

	.redacted-tag {
		@include redacted-tag;
	}

	.btn-icon {
		@include button-icon-outlined;
	}
</style>
