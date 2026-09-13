<script lang="ts">
	import type { JobStage } from "./jobTypes";

	let { stage }: { stage: JobStage } = $props();
</script>

<div class="stage">
	<div class="stage-row">
		<span class="stage-label">{stage.label} <span class="stage-note">— {stage.note}</span></span>
		<span class="stage-timing">{stage.timing}</span>
	</div>
	<div class="stage-bar">
		{#each stage.segments as segment, index (index)}
			<div class={`stage-segment stage-segment-${segment.variant}`} style:flex={segment.weight}></div>
		{/each}
	</div>
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.stage {
		@include panel;

		margin-top: $space-m;
		padding: 15px $space-m;
	}

	.stage-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: $space-l;
		font-family: $font-family-ui;
	}

	.stage-label {
		font-size: $text-regular-size;
		font-weight: 600;
	}

	.stage-note {
		font-weight: $text-regular-weight;
		color: $text-color-muted;
	}

	.stage-timing {
		font-family: $font-family-mono;
		font-size: $text-regular-size;
		color: $text-color-muted;
	}

	.stage-bar {
		@include status-bar;

		margin-top: 10px;
	}

	.stage-segment-done {
		@include status-bar-segment-done;
	}

	.stage-segment-attention {
		@include status-bar-segment-attention;
	}

	.stage-segment-failed {
		@include status-bar-segment-failed;
	}

	.stage-segment-remaining {
		@include status-bar-segment-remaining;
	}
</style>
