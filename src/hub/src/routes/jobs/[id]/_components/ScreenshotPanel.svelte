<script lang="ts">
	import ScreenshotOverlay from "./ScreenshotOverlay.svelte";

	import type { JobStepArtifact } from "$lib/types/job";

	let { jobId, artifacts }: { jobId: number; artifacts: JobStepArtifact[] } = $props();

	// The most recently reported/uploaded artifact is the best diagnostic snapshot — whichever
	// Step the Runner most recently reported or exited on (jobRepository orders oldest-to-newest).
	const latest = $derived(artifacts[artifacts.length - 1] ?? null);
	const latestUrl = $derived(latest === null ? "" : `/api/hub/jobs/${jobId}/artifacts/${latest.id}`);
	let overlayOpen = $state(false);
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Latest Screenshot</h2>
		{#if latest !== null}
			<button type="button" class="panel-view-larger" onclick={() => (overlayOpen = true)}>View larger</button>
		{/if}
	</div>
	{#if latest === null}
		<p class="panel-message">No screenshot yet.</p>
	{:else}
		<img class="panel-image" src={latestUrl} alt={`Screenshot at Step ${latest.stepId}`} />
	{/if}
</div>

<ScreenshotOverlay open={overlayOpen} onClose={() => (overlayOpen = false)} text={latest === null ? "" : `Screenshot at Step ${latest.stepId}`} imageUrl={latestUrl} />

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;

	.panel {
		@include panel;
	}

	.panel-header {
		@include panel-header;
	}

	.panel-view-larger {
		@include button-base;
		@include button-variant-secondary;
	}

	.panel-message {
		@include panel-body;

		margin: 0;
	}

	.panel-image {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
