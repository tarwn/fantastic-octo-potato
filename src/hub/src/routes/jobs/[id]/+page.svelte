<script lang="ts">
	import { onMount } from "svelte";

	import StartTrainingModal from "../../registered-applications/[id]/_components/StartTrainingModal.svelte";

	import CompiledRecipeLink from "./_components/CompiledRecipeLink.svelte";
	import GoalsPanel from "./_components/GoalsPanel.svelte";
	import InterventionOverlay from "./_components/InterventionOverlay.svelte";
	import JobStrip from "./_components/JobStrip.svelte";
	import ResultsPanel from "./_components/ResultsPanel.svelte";
	import ScreenshotPanel from "./_components/ScreenshotPanel.svelte";
	import StageSummary from "./_components/StageSummary.svelte";
	import TranscriptPanel from "./_components/TranscriptPanel.svelte";

	import { page } from "$app/state";
	import { cancelJob, endJob, fetchJob, handBackJob, takeControl } from "$lib/api/jobsApi";
	import { fetchRecipes, type RecipeSummary } from "$lib/api/recipesApi";
	import { fetchRegisteredApplication } from "$lib/api/registeredApplicationsApi";
	import RefreshIndicator from "$lib/components/RefreshIndicator.svelte";
	import { formatJobDisplayId } from "$lib/jobDisplayId";
	import { buildJobExport } from "$lib/jobExport";
	import { isTerminalJobStatus, JobStatus } from "$lib/jobStatus";
	import { TranscriptKind } from "$lib/jobTranscriptKind";
	import { JobType, jobTypeLabel } from "$lib/jobType";
	import { getOperatorId } from "$lib/operatorId";
	import { chooseRefreshIntervalSeconds } from "$lib/refreshInterval";
	import type { JobDetail } from "$lib/types/job";
	import type { RegisteredApplicationDetail } from "$lib/types/registeredApplication";

	let job = $state<JobDetail | null>(null);
	let registeredApplication = $state<RegisteredApplicationDetail | null>(null);
	let compiledRecipe = $state<RecipeSummary | null>(null);
	let loadError = $state<string | null>(null);
	let cancelError = $state<string | null>(null);
	let retryModalOpen = $state(false);
	let lastRefreshedOn = $state(new Date());
	let overlayOpen = $state(false);
	let interventionNotice = $state<string | null>(null);
	let interventionError = $state<string | null>(null);
	let operatorId = $state("");

	const jobId = $derived(Number(page.params.id));
	// Re-chosen from the latest load, so a status change switches the rate without a reload.
	const refreshIntervalSeconds = $derived(chooseRefreshIntervalSeconds(job, lastRefreshedOn));

	async function load() {
		try {
			const loadedJob = await fetchJob(jobId);
			job = loadedJob;
			registeredApplication = await fetchRegisteredApplication(loadedJob.customerApplicationXrefId);
			if (loadedJob.jobType === JobType.TrainingRun) {
				const recipes = await fetchRecipes(loadedJob.customerApplicationXrefId);
				compiledRecipe = recipes.find((recipe) => recipe.sourceTrainingRunId === String(loadedJob.id)) ?? null;
			}
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load Job";
		}
	}

	onMount(() => {
		operatorId = getOperatorId();
		void load();
	});

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

	async function handleTakeControl() {
		if (!job) return;

		interventionNotice = null;
		interventionError = null;
		try {
			await takeControl(job.id, operatorId);
			await refresh();
			overlayOpen = true;
		}
		catch (err) {
			interventionError = err instanceof Error ? err.message : "Failed to take control";
			await refresh();
		}
	}

	async function handleEndJob() {
		if (!job) return;

		interventionError = null;
		try {
			await endJob(job.id, operatorId);
			await refresh();
		}
		catch (err) {
			interventionError = err instanceof Error ? err.message : "Failed to end Job";
		}
	}

	async function handleHandBack(resumeStepId: string) {
		if (!job) return;

		interventionError = null;
		try {
			await handBackJob(job.id, operatorId, resumeStepId);
			await refresh();
		}
		catch (err) {
			interventionError = err instanceof Error ? err.message : "Failed to hand back";
		}
	}

	function closeOverlay(notice: string | null) {
		overlayOpen = false;
		interventionNotice = notice;
	}

	function exportJson() {
		if (!job) return;

		const blob = new Blob([JSON.stringify(buildJobExport(job), null, 2)], { type: "application/json" });
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
	{:else if job && registeredApplication && job.jobType === JobType.TrainingRun}
		<div class="job-page-content">
			<div class="job-page-eyebrow">
				<span class="job-page-mode">{jobTypeLabel(job).toUpperCase()}</span>
				<span class="job-page-divider">|</span>
				<span class="job-page-id">{formatJobDisplayId(job.customerApplicationXrefId, job.id)}</span>
			</div>
			<div class="job-page-header">
				<h1>{job.name}</h1>
				<div class="job-page-actions">
					<RefreshIndicator intervalSeconds={refreshIntervalSeconds} {lastRefreshedOn} onRefresh={refresh} />
					{#if !isTerminalJobStatus(job.jobStatusId)}
						<button type="button" class="btn" onclick={handleCancel}>Cancel job</button>
					{/if}
					<button type="button" class="btn" onclick={exportJson}>Export JSON</button>
					<button type="button" class="btn" onclick={() => (retryModalOpen = true)}>Retry Job</button>
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
			<StageSummary {job} stepsTaken={job.transcript.filter((entry) => entry.kind === TranscriptKind.Step).length} />
			<CompiledRecipeLink recipe={compiledRecipe} registeredApplicationId={job.customerApplicationXrefId} />

			<div class="job-page-panels">
				<TranscriptPanel entries={job.transcript} jobId={job.id} artifacts={job.artifacts} steps={job.steps} recoveries={[]} />
				<div class="job-page-side">
					<ResultsPanel results={job.results} />
					<GoalsPanel goal={job.details.goal} allowlist={job.details.allowlist} />
				</div>
			</div>
			<StartTrainingModal
				open={retryModalOpen}
				onClose={() => (retryModalOpen = false)}
				registeredApplicationId={job.customerApplicationXrefId}
				initialValues={job.details}
			/>
		</div>
	{:else if job && registeredApplication && job.jobType === JobType.Recipe}
		<div class="job-page-content">
			<div class="job-page-eyebrow">
				<span class="job-page-mode">{jobTypeLabel(job).toUpperCase()}</span>
				<span class="job-page-divider">|</span>
				<span class="job-page-id">{formatJobDisplayId(job.customerApplicationXrefId, job.id)}</span>
			</div>
			<div class="job-page-header">
				<h1>{job.name}</h1>
				<div class="job-page-actions">
					<RefreshIndicator intervalSeconds={refreshIntervalSeconds} {lastRefreshedOn} onRefresh={refresh} />
					{#if job.jobStatusId === JobStatus.InterventionRequested}
						<button type="button" class="btn" onclick={handleTakeControl}>Take Control</button>
					{:else if job.jobStatusId === JobStatus.InteractiveUser}
						<button type="button" class="btn" onclick={() => (overlayOpen = true)}>
							{job.interventionOwner === operatorId ? "Open control panel" : "View control panel"}
						</button>
					{/if}
					{#if job.jobStatusId === JobStatus.InterventionRequested || job.jobStatusId === JobStatus.InteractiveUser}
						<button type="button" class="btn" onclick={handleCancel}>Cancel job</button>
					{/if}
					<button type="button" class="btn" onclick={exportJson}>Export JSON</button>
				</div>
			</div>
			{#if cancelError}
				<p class="job-page-message">{cancelError}</p>
			{/if}
			{#if interventionError}
				<p class="job-page-message" role="alert">{interventionError}</p>
			{/if}
			{#if interventionNotice}
				<p class="job-page-message" role="status">{interventionNotice}</p>
			{/if}
			{#if job.interventionOwner !== null}
				<p class="job-page-message" data-testid="job-owner">Owner: {job.interventionOwner === operatorId ? "you" : job.interventionOwner}</p>
			{/if}

			<JobStrip
				customerName={registeredApplication.customerName}
				applicationName={registeredApplication.applicationName}
				runnerId={job.runnerId}
				jobStatusId={job.jobStatusId}
			/>

			<div class="job-page-panels">
				<TranscriptPanel entries={job.transcript} jobId={job.id} artifacts={job.artifacts} steps={job.recipe.steps} recoveries={job.recipe.recoveries} />
				<div class="job-page-side">
					<ResultsPanel results={job.results} />
					<ScreenshotPanel jobId={job.id} artifacts={job.artifacts} />
				</div>
			</div>
			{#if overlayOpen}
				<InterventionOverlay {job} {operatorId} endError={interventionError} onEndJob={handleEndJob} onHandBack={handleHandBack} onClose={closeOverlay} />
			{/if}
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
