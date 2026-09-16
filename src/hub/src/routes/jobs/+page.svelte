<script lang="ts">
	import { onMount } from "svelte";

	import { resolve } from "$app/paths";
	import { fetchJobs } from "$lib/api/jobsApi";
	import { fetchRegisteredApplications } from "$lib/api/registeredApplicationsApi";
	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import { formatJobDisplayId } from "$lib/jobDisplayId";
	import { JOB_STATUS_LABELS, JOB_STATUS_VARIANTS } from "$lib/jobStatus";
	import type { Job } from "$lib/types/job";
	import type { RegisteredApplication } from "$lib/types/registeredApplication";

	let jobs = $state<Job[]>([]);
	let registeredApplicationsById = $state<Map<number, RegisteredApplication>>(new Map());
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			const [loadedJobs, registeredApplications] = await Promise.all([fetchJobs(), fetchRegisteredApplications()]);
			jobs = loadedJobs;
			registeredApplicationsById = new Map(registeredApplications.map((app) => [app.id, app]));
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load Jobs";
		}
	});
</script>

<svelte:head>
	<title>Jobs · Hub</title>
</svelte:head>

<div class="page">
	<h1>Jobs</h1>
	<div class="panel">
		<div class="panel-header">
			<h2>All jobs</h2>
		</div>
		{#if loadError}
			<p class="panel-message">{loadError}</p>
		{:else if jobs.length === 0}
			<p class="panel-message">No jobs yet.</p>
		{:else}
			<ul class="panel-rows job-list">
				{#each jobs as job (job.id)}
					{@const registeredApplication = registeredApplicationsById.get(job.customerApplicationXrefId)}
					<li class="panel-row">
						<a href={resolve("/jobs/[id]", { id: String(job.id) })} class="job-link">
							<span class="job-id">{formatJobDisplayId(job.customerApplicationXrefId, job.id)}</span>
							<span class="job-context">
								{registeredApplication ? `${registeredApplication.customerName} — ${registeredApplication.applicationName}` : ""}
							</span>
						</a>
						<span class="job-mode">{job.mode}</span>
						<StatusBadge text={JOB_STATUS_LABELS[job.jobStatusId]} variant={JOB_STATUS_VARIANTS[job.jobStatusId]} />
						<span class="job-time">{(job.startedAt ?? job.createdAt).toLocaleString()}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style lang="scss">
	@use "../../lib/styles/mixins" as *;
	@use "../../lib/styles/variables" as *;

	.page {
		padding: $space-l;
	}

	h1 {
		margin: 0 0 $space-m;
		font-size: $text-h1-size;
		font-weight: $text-h1-weight;
		line-height: $text-h1-line-height;
		letter-spacing: $text-h1-letter-spacing;
	}

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

	.job-list {
		@include panel-rows;

		margin: 0;
		padding: 0;
		list-style: none;
	}

	.panel-row {
		@include panel-row;

		align-items: center;
		gap: $space-m;
	}

	.job-link {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: $space-xs;
		min-width: 0;
		color: $anchor-default-color;
	}

	.job-id {
		font-family: $font-family-mono;
	}

	.job-context {
		font-size: $text-small-size;
		color: $text-color-muted;
	}

	.job-mode {
		font-family: $font-family-mono;
		font-size: $text-small-size;
		color: $text-color-muted;
		text-transform: uppercase;
	}

	.job-time {
		font-family: $font-family-mono;
		font-size: $text-small-size;
		color: $text-color-muted;
		white-space: nowrap;
	}
</style>
