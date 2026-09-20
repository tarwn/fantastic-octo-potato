<script lang="ts">
	import { resolve } from "$app/paths";
	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import { formatJobDisplayId } from "$lib/jobDisplayId";
	import { JOB_STATUS_LABELS, JOB_STATUS_VARIANTS, JobStatus } from "$lib/jobStatus";
	import type { Job } from "$lib/types/job";

	let { jobs }: { jobs: Job[] } = $props();

	const interventionJobs = $derived(jobs.filter((job) => job.jobStatusId === JobStatus.InterventionRequested || job.jobStatusId === JobStatus.InteractiveUser));
</script>

{#if interventionJobs.length > 0}
	<div class="panel" data-testid="intervention-jobs">
		<div class="panel-header">
			<h2>Needs intervention</h2>
		</div>
		<ul class="panel-rows intervention-list">
			{#each interventionJobs as job (job.id)}
				<li class="panel-row">
					<a href={resolve("/jobs/[id]", { id: String(job.id) })}>{formatJobDisplayId(job.customerApplicationXrefId, job.id)} {job.name}</a>
					<StatusBadge text={JOB_STATUS_LABELS[job.jobStatusId]} variant={JOB_STATUS_VARIANTS[job.jobStatusId]} />
					<span class="owner">{job.interventionOwner === null ? "Unowned" : `Owner: ${job.interventionOwner}`}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style lang="scss">
	@use "../styles/mixins" as *;
	@use "../styles/variables" as *;

	.panel {
		@include panel;

		margin-bottom: $space-m;
	}

	.panel-header {
		@include panel-header;
	}

	.intervention-list {
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

	a {
		flex: 1;
		color: $anchor-default-color;
	}

	.owner {
		font-size: $text-small-size;
		color: $text-color-muted;
	}
</style>
