<script lang="ts">
	import { untrack } from "svelte";

	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import { JOB_STATUS_LABELS, JOB_STATUS_VARIANTS, JobStatus } from "$lib/jobStatus";
	import { TranscriptKind } from "$lib/jobTranscriptKind";
	import { JobType } from "$lib/jobType";
	import { collectResumableStepIds } from "$lib/recipeStepIds";
	import type { JobDetail, JobTranscriptEntry } from "$lib/types/job";

	const RECENT_TRANSCRIPT_ENTRIES = 6;

	let {
		job,
		operatorId,
		endError,
		onHandBack,
		onEndJob,
		onClose
	}: {
		job: JobDetail;
		operatorId: string;
		endError: string | null;
		onHandBack: (resumeStepId: string) => void;
		onEndJob: () => void;
		onClose: (notice: string | null) => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | undefined>();
	// The owner this overlay was opened against: a different owner later means control was lost.
	const ownerAtOpen = untrack(() => job.interventionOwner);

	const isOwner = $derived(job.jobStatusId === JobStatus.InteractiveUser && job.interventionOwner === operatorId);
	const latestArtifact = $derived(job.artifacts.reduce<JobDetail["artifacts"][number] | undefined>((latest, artifact) => (latest && latest.id > artifact.id ? latest : artifact), undefined));
	const recentEntries = $derived(job.transcript.slice(-RECENT_TRANSCRIPT_ENTRIES));
	const resumeStepIds = $derived(job.jobType === JobType.Recipe ? collectResumableStepIds(job.recipe) : []);
	// Defaults to the blocked step; the operator overrides it with the selector.
	let resumeStepId = $state(untrack(() => (job.blockedStepId !== null && resumeStepIds.includes(job.blockedStepId) ? job.blockedStepId : (resumeStepIds[0] ?? ""))));
	const handingBack = $derived(job.resumeStepId !== null);

	$effect(() => {
		dialogEl?.showModal();
	});

	// A status or owner change means the operator no longer holds (or is viewing) the session they opened.
	$effect(() => {
		if (job.jobStatusId !== JobStatus.InteractiveUser) {
			onClose(`Job is now ${JOB_STATUS_LABELS[job.jobStatusId]}`);
		}
		else if (job.interventionOwner !== ownerAtOpen) {
			onClose(`Control moved to operator ${job.interventionOwner}`);
		}
	});

	function describeEntry(entry: JobTranscriptEntry): string {
		return entry.kind === TranscriptKind.Step ? `${entry.text.stepId}: ${entry.text.outcome}` : entry.text;
	}
</script>

<dialog bind:this={dialogEl} class="overlay" onclose={() => onClose(null)} data-testid="intervention-overlay">
	<div class="overlay-header">
		<h2>Human intervention</h2>
		<div class="overlay-status">
			<StatusBadge text={JOB_STATUS_LABELS[job.jobStatusId]} variant={JOB_STATUS_VARIANTS[job.jobStatusId]} />
			<span data-testid="intervention-owner">Owner: {job.interventionOwner === operatorId ? "you" : (job.interventionOwner ?? "none")}</span>
		</div>
	</div>

	<p class="overlay-blocked" data-testid="intervention-blocked">
		Blocked at step <strong>{job.blockedStepId}</strong>: {job.blockedReason}
	</p>

	<div class="overlay-body">
		{#if latestArtifact}
			<img class="overlay-image" src={`/api/hub/jobs/${job.id}/artifacts/${latestArtifact.id}`} alt="Latest screenshot of the blocked session" />
		{:else}
			<p class="overlay-empty">No screenshot yet.</p>
		{/if}
		<ol class="overlay-transcript" aria-label="Recent transcript">
			{#each recentEntries as entry (entry.id)}
				<li>{describeEntry(entry)}</li>
			{/each}
		</ol>
	</div>

	{#if !isOwner}
		<p class="overlay-readonly" data-testid="intervention-readonly">Read-only: this session is controlled by another operator.</p>
	{/if}
	{#if endError}
		<p class="overlay-error">{endError}</p>
	{/if}
	<div class="overlay-actions">
		{#if isOwner}
			<label class="resume-select">
				Resume at
				<select bind:value={resumeStepId} disabled={handingBack} data-testid="resume-step">
					{#each resumeStepIds as stepId (stepId)}
						<option value={stepId}>{stepId}</option>
					{/each}
				</select>
			</label>
			<button type="button" class="btn" disabled={handingBack} onclick={() => onHandBack(resumeStepId)}>
				{handingBack ? "Handing back…" : "Hand Back"}
			</button>
			<button type="button" class="btn" disabled={handingBack} onclick={onEndJob}>End Job</button>
		{/if}
		<button type="button" class="btn" onclick={() => dialogEl?.close()}>Close</button>
	</div>
</dialog>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.overlay {
		@include panel;

		box-shadow: $box-shadow-overlay;
		box-sizing: border-box;
		width: calc(100vw - 40px);
		max-width: none;
		height: calc(100vh - 40px);
		max-height: none;
		padding: $panel-body-padding;

		&[open] {
			display: flex;
			flex-direction: column;
			gap: $space-m;
		}

		&::backdrop {
			background-color: $overlay-backdrop-color;
		}
	}

	.overlay-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-m;

		h2 {
			margin: 0;
		}
	}

	.overlay-status {
		display: flex;
		align-items: center;
		gap: $space-m;
		font-size: $text-small-size;
	}

	.overlay-blocked {
		margin: 0;
		font-family: $font-family-mono;
		font-size: $text-regular-size;
	}

	.overlay-body {
		display: grid;
		flex: 1;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: $space-m;
		min-height: 0;
	}

	.overlay-image {
		display: block;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.overlay-empty,
	.overlay-readonly {
		margin: 0;
		color: $text-color-muted;
	}

	.overlay-error {
		margin: 0;
		color: $status-error-color;
	}

	.overlay-transcript {
		margin: 0;
		padding-left: $space-l;
		overflow-y: auto;
		font-family: $font-family-mono;
		font-size: $text-small-size;
	}

	.resume-select {
		display: flex;
		align-items: center;
		gap: $space-s;
		margin-right: auto;
		font-size: $text-small-size;
	}

	.overlay-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: $space-m;
	}

	.btn {
		@include button-base;
		@include button-variant-secondary;

		flex: none;
	}
</style>
