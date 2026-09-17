<script lang="ts">
	import type { JobStepArtifact } from "$lib/types/job";

	let { jobId, artifacts }: { jobId: number; artifacts: JobStepArtifact[] } = $props();

	// The most recently reported/uploaded artifact is the best diagnostic snapshot — whichever
	// Step the Runner most recently reported or exited on (jobRepository orders oldest-to-newest).
	const latest = $derived(artifacts[artifacts.length - 1] ?? null);
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Screenshot</h2>
	</div>
	{#if latest === null}
		<p class="panel-message">No screenshot yet.</p>
	{:else}
		<img class="panel-image" src={`/api/hub/jobs/${jobId}/artifacts/${latest.id}`} alt={`Screenshot at Step ${latest.stepId}`} />
	{/if}
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;

	.panel {
		@include panel;
	}

	.panel-header {
		@include panel-header;
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
