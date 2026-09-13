<script lang="ts">
	import GoalsPanel from "./_components/GoalsPanel.svelte";
	import JobStrip from "./_components/JobStrip.svelte";
	import ResultsPanel from "./_components/ResultsPanel.svelte";
	import StageSummary from "./_components/StageSummary.svelte";
	import TranscriptPanel from "./_components/TranscriptPanel.svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();
	const job = $derived(data.job);

	function exportJson() {
		const blob = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${job.id}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>{job.title} · Hub</title>
</svelte:head>

<div class="job-page">
	{#if job.interventionMessage}
		<div class="job-page-intervention">
			<span class="job-page-intervention-tag">Intervention</span>
			<span class="job-page-intervention-message">{job.interventionMessage}</span>
			<button type="button" class="btn btn-caution">Take control</button>
		</div>
	{/if}
	<div class="job-page-content">
		<div class="job-page-eyebrow">
			<span class="job-page-mode">{job.eyebrow}</span>
			<span class="job-page-divider">|</span>
			<span class="job-page-id">{job.id}</span>
		</div>
		<div class="job-page-header">
			<h1>{job.title}</h1>
			<div class="job-page-actions">
				{#if job.mode === "execute"}
					<button type="button" class="btn">Cancel job</button>
				{/if}
				<button type="button" class="btn" onclick={exportJson}>Export JSON</button>
				{#if job.mode === "training"}
					<button type="button" class="btn btn-primary">Start Trial run</button>
				{/if}
			</div>
		</div>

		<JobStrip strip={job.strip} />
		<StageSummary stage={job.stage} />

		<div class="job-page-panels">
			<TranscriptPanel meta={job.transcriptMeta} days={job.transcript} />
			<div class="job-page-side">
				<ResultsPanel meta={job.resultsMeta} results={job.results} />
				{#if job.goals}
					<GoalsPanel goals={job.goals} />
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	@use "../../../lib/styles/mixins" as *;
	@use "../../../lib/styles/variables" as *;

	.job-page {
		border-right: $border-hairline-width solid $border-color-panel;
		border-bottom: $border-hairline-width solid $border-color-panel;
		border-left: $border-hairline-width solid $border-color-panel;
	}

	.job-page-intervention {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-l;
		padding: 13px $space-l;
		background-color: $status-intervention-surface;
		border-bottom: $border-hairline-width solid $status-intervention-border;
	}

	.job-page-intervention-tag {
		flex: none;
		padding: 3px 7px;
		border: $border-hairline-width solid $status-intervention-border;
		font-family: $font-family-mono;
		font-size: $text-micro-size;
		font-weight: $text-micro-weight;
		letter-spacing: $text-micro-letter-spacing;
		color: $status-intervention-color;
		text-transform: uppercase;
	}

	.job-page-intervention-message {
		flex: 1;
		font-size: $text-regular-size;
		color: $color-rust-800;
	}

	.job-page-content {
		padding: $space-l;
		background-color: $surface-color-page;
	}

	.job-page-eyebrow {
		display: flex;
		align-items: center;
		gap: $space-s;
		margin-bottom: $space-s;
		font-size: $text-small-size;
		color: $text-color-muted;
	}

	.job-page-mode {
		font-family: $font-family-mono;
		font-weight: 700;
		letter-spacing: $text-micro-letter-spacing;
		color: $text-color-primary;
	}

	.job-page-divider {
		color: $border-color-control;
	}

	.job-page-id {
		font-family: $font-family-mono;
	}

	.job-page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-xl;

		h1 {
			margin: 0;
			font-size: $text-h1-size;
			font-weight: $text-h1-weight;
			line-height: $text-h1-line-height;
			letter-spacing: $text-h1-letter-spacing;
		}
	}

	.job-page-actions {
		display: flex;
		gap: $space-s;
	}

	.btn {
		@include button-base;
		@include button-variant-secondary;
	}

	.btn-caution {
		@include button-variant-caution;

		flex: none;
	}

	.btn-primary {
		@include button-variant-primary;
	}

	.job-page-panels {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
		gap: $space-m;
		align-items: start;
		margin-top: $space-m;
	}

	.job-page-side {
		display: flex;
		flex-direction: column;
		gap: $space-m;
	}
</style>
