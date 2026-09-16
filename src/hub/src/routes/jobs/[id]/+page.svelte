<script lang="ts">
	import { onMount } from "svelte";

	import GoalsPanel from "./_components/GoalsPanel.svelte";
	import JobStrip from "./_components/JobStrip.svelte";
	import ResultsPanel from "./_components/ResultsPanel.svelte";
	import StageSummary from "./_components/StageSummary.svelte";
	import TranscriptPanel from "./_components/TranscriptPanel.svelte";

	import { page } from "$app/state";
	import { cancelJob, fetchJob } from "$lib/api/jobsApi";
	import { fetchRegisteredApplication } from "$lib/api/registeredApplicationsApi";
	import RefreshIndicator from "$lib/components/RefreshIndicator.svelte";
	import { formatJobDisplayId } from "$lib/jobDisplayId";
	import { isTerminalJobStatus } from "$lib/jobStatus";
	import type { JobDetail } from "$lib/types/job";
	import type { RegisteredApplicationDetail } from "$lib/types/registeredApplication";

	const REFRESH_INTERVAL_SECONDS = 5;

	let job = $state<JobDetail | null>(null);
	let registeredApplication = $state<RegisteredApplicationDetail | null>(null);
	let loadError = $state<string | null>(null);
	let cancelError = $state<string | null>(null);
	let lastRefreshedOn = $state(new Date());

	const jobId = $derived(Number(page.params.id));

	async function load() {
		try {
			const loadedJob = await fetchJob(jobId);
			job = loadedJob;
			registeredApplication = await fetchRegisteredApplication(loadedJob.customerApplicationXrefId);
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load Job";
		}
	}

	onMount(load);

	async function refresh() {
		await load();
		lastRefreshedOn = new Date();
	}

	async function handleCancel() {
		if (!job) return;

		cancelError = null;
		try {
			await cancelJob(job.id);
			await refresh();
		}
		catch (err) {
			cancelError = err instanceof Error ? err.message : "Failed to cancel Job";
		}
	}

	function exportJson() {
		if (!job) return;

		const blob = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${formatJobDisplayId(job.customerApplicationXrefId, job.id)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>{job ? formatJobDisplayId(job.customerApplicationXrefId, job.id) : "Job"} · Hub</title>
</svelte:head>

<div class="job-page">
	{#if loadError}
		<p class="job-page-message">{loadError}</p>
	{:else if job && registeredApplication}
		<div class="job-page-content">
			<div class="job-page-eyebrow">
				<span class="job-page-mode">{job.mode.toUpperCase()}</span>
				<span class="job-page-divider">|</span>
				<span class="job-page-id">{formatJobDisplayId(job.customerApplicationXrefId, job.id)}</span>
			</div>
			<div class="job-page-header">
				<h1>{job.goal}</h1>
				<div class="job-page-actions">
					<RefreshIndicator intervalSeconds={REFRESH_INTERVAL_SECONDS} {lastRefreshedOn} onRefresh={refresh} />
					{#if !isTerminalJobStatus(job.jobStatusId)}
						<button type="button" class="btn" onclick={handleCancel}>Cancel job</button>
					{/if}
					<button type="button" class="btn" onclick={exportJson}>Export JSON</button>
				</div>
			</div>
			{#if cancelError}
				<p class="job-page-message">{cancelError}</p>
			{/if}

			<JobStrip
				customerName={registeredApplication.customerName}
				applicationName={registeredApplication.applicationName}
				runnerId={job.runnerId}
				jobStatusId={job.jobStatusId}
			/>
			<StageSummary {job} stepsTaken={job.transcript.filter((entry) => entry.kind === "step").length} />

			<div class="job-page-panels">
				<TranscriptPanel entries={job.transcript} />
				<div class="job-page-side">
					<ResultsPanel results={job.results} />
					<GoalsPanel goal={job.goal} allowlist={job.allowlist} />
				</div>
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	@use "../../../lib/styles/mixins" as *;
	@use "../../../lib/styles/variables" as *;

	.job-page {
		border-right: $border-hairline-width solid $border-color-panel;
		border-bottom: $border-hairline-width solid $border-color-panel;
		border-left: $border-hairline-width solid $border-color-panel;
	}

	.job-page-message {
		@include panel-body;

		margin: 0;
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
		align-items: center;
		gap: $space-m;
	}

	.btn {
		@include button-base;
		@include button-variant-secondary;

		flex: none;
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
