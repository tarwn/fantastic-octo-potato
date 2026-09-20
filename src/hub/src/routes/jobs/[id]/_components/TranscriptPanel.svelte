<script lang="ts">
	import ScreenshotOverlay from "./ScreenshotOverlay.svelte";

	import RedactedValue from "$lib/components/RedactedValue.svelte";
	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import { JOB_STATUS_LABELS, JOB_STATUS_VARIANTS } from "$lib/jobStatus";
	import { TranscriptKind } from "$lib/jobTranscriptKind";
	import { SensitivityType } from "$lib/sensitivityType";
	import type { JobStepArtifact, JobTranscriptEntry, StepTranscriptText, TranscriptFieldRef } from "$lib/types/job";

	let { entries, jobId, artifacts }: { entries: JobTranscriptEntry[]; jobId: number; artifacts: JobStepArtifact[] } = $props();

	let overlay = $state<{ text: string; imageUrl: string } | null>(null);

	interface TranscriptDay {
		dateLabel: string;
		entries: JobTranscriptEntry[];
	}

	function groupByDay(entries: JobTranscriptEntry[]): TranscriptDay[] {
		const days: TranscriptDay[] = [];
		for (const entry of entries) {
			const dateLabel = entry.createdAt.toDateString();
			const lastDay = days[days.length - 1];
			if (lastDay && lastDay.dateLabel === dateLabel) {
				lastDay.entries.push(entry);
			}
			else {
				days.push({ dateLabel, entries: [entry] });
			}
		}
		return days;
	}

	const days = $derived(groupByDay(entries));

	function stepMessage({ stepId, action, targetDescription }: StepTranscriptText): string {
		const selector = targetDescription.selector === "" ? "" : `(${targetDescription.selector})`;
		return `${stepId}: ${action} on ${targetDescription.component}${selector}`;
	}

	// Artifacts are ordered oldest-to-newest, so the last match is the latest for that Step.
	function artifactFor(stepId: string): JobStepArtifact | undefined {
		return artifacts.findLast((artifact) => artifact.stepId === stepId);
	}

	function openScreenshot(text: StepTranscriptText, artifact: JobStepArtifact) {
		overlay = { text: stepMessage(text), imageUrl: `/api/hub/jobs/${jobId}/artifacts/${artifact.id}` };
	}

	function kindName(kind: TranscriptKind): string {
		return TranscriptKind[kind];
	}
</script>

{#snippet transcriptStepField(label: string, field: TranscriptFieldRef)}
	<div class="transcript-step-field">
		<span class="transcript-step-field-label">{label}: {field.fieldName}</span>
		{#if field.sensitivityType !== SensitivityType.None}
			→ <RedactedValue value={field.safeValue} />
		{:else}
			→ <span class="transcript-step-field-value">{field.safeValue}</span>
		{/if}
	</div>
{/snippet}

<div class="panel">
	<div class="panel-header">
		<h2>Transcript</h2>
		<span class="panel-meta">{entries.length} entries</span>
	</div>
	{#if entries.length === 0}
		<p class="panel-message">No transcript entries yet.</p>
	{/if}
	{#each days as day (day.dateLabel)}
		<div class="transcript-date">{day.dateLabel}</div>
		<div class="transcript transcript-rows">
			{#each day.entries as entry (entry.sequence)}
				<div class={["transcript-row", entry.jobStatusId !== null && `transcript-row-${JOB_STATUS_VARIANTS[entry.jobStatusId]}`]}>
					{#if entry.jobStatusId !== null}
						<span class={`transcript-rail transcript-rail-${JOB_STATUS_VARIANTS[entry.jobStatusId]}`}></span>
					{:else}
						<span class="transcript-rail"></span>
					{/if}
					<span class="transcript-time">{entry.createdAt.toLocaleTimeString()}</span>
					<span class={`transcript-kind-${kindName(entry.kind).toLowerCase()}`}>{kindName(entry.kind).toUpperCase()}</span>
					<span class="transcript-text">
						{#if entry.kind === TranscriptKind.Step}
							{@const step = entry.text}
							{@const artifact = artifactFor(step.stepId)}
							<span class="transcript-step-message">
								{stepMessage(step)}
								{#if artifact}
									<button type="button" class="transcript-screenshot-button" aria-label={`View screenshot for ${step.stepId}`} onclick={() => openScreenshot(step, artifact)}>🖼</button>
								{/if}
							</span>
							{#each entry.text.inputs as field (field.fieldName)}
								{@render transcriptStepField("input", field)}
							{/each}
							{#each entry.text.outputs as field (field.fieldName)}
								{@render transcriptStepField("output", field)}
							{/each}
						{:else}
							{entry.text}
						{/if}
					</span>
					{#if entry.jobStatusId !== null}
						<StatusBadge text={JOB_STATUS_LABELS[entry.jobStatusId]} variant={JOB_STATUS_VARIANTS[entry.jobStatusId]} />
					{:else}
						<span></span>
					{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>

<ScreenshotOverlay open={overlay !== null} onClose={() => (overlay = null)} text={overlay?.text ?? ""} imageUrl={overlay?.imageUrl ?? ""} />

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

	.panel-message {
		@include panel-body;

		margin: 0;
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

	.transcript-rail-pending {
		@include transcript-rail($status-pending-color);
	}

	.transcript-rail-running {
		@include transcript-rail($status-running-color);
	}

	.transcript-rail-success {
		@include transcript-rail($status-success-color);
	}

	.transcript-rail-failed {
		@include transcript-rail($status-failed-color);
	}

	.transcript-rail-cancelled {
		@include transcript-rail($status-cancelled-color);
	}

	.transcript-rail-intervention {
		@include transcript-rail($status-intervention-color);
	}

	.transcript-rail-error {
		@include transcript-rail($status-error-color);
	}

	.transcript-time {
		@include transcript-cell-time;
	}

	.transcript-row {
		@include transcript-row;
	}

	.transcript-row-intervention {
		@include transcript-row-emphasis($status-intervention-surface, $status-intervention-border);
	}

	.transcript-row-success {
		@include transcript-row-emphasis($status-success-surface, $status-success-border);
	}

	.transcript-row-failed {
		@include transcript-row-emphasis($status-failed-surface, $status-failed-border);
	}

	.transcript-row-error {
		@include transcript-row-emphasis($status-error-surface, $status-error-border);
	}

	.transcript-kind-status {
		@include transcript-cell-kind($transcript-kind-status-color);
	}

	.transcript-kind-step {
		@include transcript-cell-kind($transcript-kind-step-color);
	}

	.transcript-kind-recover {
		@include transcript-cell-kind($transcript-kind-recover-color);
	}

	.transcript-kind-halt {
		@include transcript-cell-kind($transcript-kind-halt-color);
	}

	.transcript-kind-observe {
		@include transcript-cell-kind($transcript-kind-observe-color);
	}

	.transcript-kind-plan {
		@include transcript-cell-kind($transcript-kind-plan-color);
	}

	.transcript-kind-info {
		@include transcript-cell-kind($transcript-kind-info-color);
	}

	.transcript-text {
		@include transcript-cell-text;
	}

	.transcript-step-message {
		display: block;
	}

	.transcript-screenshot-button {
		padding: 0;
		margin-left: $space-xs;
		font-size: inherit;
		background: none;
		border: 0;
		cursor: pointer;
	}

	.transcript-step-field {
		display: flex;
		align-items: center;
		gap: $space-xs;
	}

	.transcript-step-field-label {
		color: $text-color-muted;
	}
</style>
