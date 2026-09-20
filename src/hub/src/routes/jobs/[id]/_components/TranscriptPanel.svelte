<script lang="ts">
	import { SvelteSet } from "svelte/reactivity";

	import ScreenshotOverlay from "./ScreenshotOverlay.svelte";

	import RedactedValue from "$lib/components/RedactedValue.svelte";
	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import StepDescription from "$lib/components/step/StepDescription.svelte";
	import { isInterventionStepId } from "$lib/interventionCommand";
	import { JOB_STATUS_LABELS, JOB_STATUS_VARIANTS } from "$lib/jobStatus";
	import { TranscriptKind } from "$lib/jobTranscriptKind";
	import { SensitivityType } from "$lib/sensitivityType";
	import type { JobStepArtifact, JobTranscriptEntry, StepTranscriptText, TranscriptFieldRef } from "$lib/types/job";
	import type { ChildStep, Recovery, Step } from "$lib/types/recipeDefinition";

	let { entries, jobId, artifacts, steps, recoveries }: {
		entries: JobTranscriptEntry[];
		jobId: number;
		artifacts: JobStepArtifact[];
		steps: Step[];
		recoveries: Recovery[];
	} = $props();

	let overlay = $state<{ text: string; imageUrl: string } | null>(null);
	const expanded = new SvelteSet<number>();

	function toggle(sequence: number) {
		if (!expanded.delete(sequence)) {
			expanded.add(sequence);
		}
	}

	function findIn(candidates: Step[], stepId: string): Step | undefined {
		for (const candidate of candidates) {
			if (candidate.id === stepId) return candidate;
			const children = candidate.action === "group"
				? candidate.args[0]
				: candidate.action === "if"
				? [...candidate.args[0].flatMap((ifCase) => ifCase.steps), ...candidate.args[1]]
				: [];
			const found = findIn(children, stepId);
			if (found) return found;
		}
		return undefined;
	}

	// Operator commands aren't part of the Recipe, so they have no definition to describe.
	function findStep(stepId: string): Step | undefined {
		if (isInterventionStepId(stepId)) return undefined;
		const recoverySteps: ChildStep[] = recoveries.flatMap((recovery) => recovery.steps);
		const found = findIn([...steps, ...recoverySteps], stepId);
		if (!found) throw new Error(`Step ${stepId} not found in the definition`);
		return found;
	}

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

	function observedMessage({ action, targetDescription }: StepTranscriptText): string {
		if (action === "open") {
			return "navigate to URL";
		}
		const selector = targetDescription.selector === "" ? "" : `(${targetDescription.selector})`;
		return `${action} on ${targetDescription.component}${selector}`;
	}

	function stepMessage(step: StepTranscriptText): string {
		return `${step.stepId}: ${observedMessage(step)}`;
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
				{@const step = entry.kind === TranscriptKind.Step ? entry.text : null}
				{@const definition = step && findStep(step.stepId)}
				{@const artifact = step && artifactFor(step.stepId)}
				<div class="transcript-entry">
					<div class={["transcript-row", entry.jobStatusId !== null && `transcript-row-${JOB_STATUS_VARIANTS[entry.jobStatusId]}`]}>
						{#if entry.jobStatusId !== null}
							<span class={`transcript-rail transcript-rail-${JOB_STATUS_VARIANTS[entry.jobStatusId]}`}></span>
						{:else}
							<span class="transcript-rail"></span>
						{/if}
						<span class="transcript-time">{entry.createdAt.toLocaleTimeString()}</span>
						<span class={`transcript-kind-${kindName(entry.kind).toLowerCase()}`}>{kindName(entry.kind).toUpperCase()}</span>
						<span class="transcript-text">
							{#if step}
								<span class="transcript-step-message">{definition?.intent ?? stepMessage(step)}</span>
								{#each step.inputs as field (field.fieldName)}
									{@render transcriptStepField("input", field)}
								{/each}
								{#each step.outputs as field (field.fieldName)}
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
						<span class="transcript-screenshot-cell">
							{#if step && artifact}
								<button type="button" class="transcript-screenshot-button" aria-label={`View screenshot for ${step.stepId}`} onclick={() => openScreenshot(step, artifact)}>▣</button>
							{/if}
						</span>
						<span class="transcript-toggle-cell">
							{#if step}
								<button
									type="button"
									class="transcript-toggle-button"
									aria-label={`Toggle details for ${step.stepId}`}
									aria-expanded={expanded.has(entry.sequence)}
									onclick={() => toggle(entry.sequence)}
								>{expanded.has(entry.sequence) ? "▾" : "▸"}</button>
							{/if}
						</span>
					</div>
					{#if step && expanded.has(entry.sequence)}
						<div class="transcript-detail">
							<div>id: {step.stepId}</div>
							<div>outcome: {step.outcome}</div>
							{#if definition}
								<div><span class="transcript-detail-label">recipe step:</span> <StepDescription step={definition} /></div>
							{/if}
							<div><span class="transcript-detail-label">observed:</span> {observedMessage(step)}</div>
						</div>
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

	.transcript-screenshot-cell,
	.transcript-toggle-cell {
		align-self: center;
	}

	.transcript-screenshot-button,
	.transcript-toggle-button {
		width: $transcript-action-column-width;
		height: $transcript-action-column-width;
		padding: 0;
		margin: (-$space-xs) 0;
		font-size: inherit;
		line-height: 1;
		color: $transcript-action-color;
		background: none;
		border: 0;
		cursor: pointer;

		&:hover {
			color: $transcript-action-hover-color;
		}
	}

	.transcript-detail {
		padding: 0 $transcript-row-padding-x $transcript-row-padding-y $transcript-detail-indent;
	}

	.transcript-detail-label {
		color: $text-color-muted;
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
