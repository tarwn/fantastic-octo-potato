<script lang="ts">
	import { JobStatus } from "$lib/jobStatus";
	import { JobType } from "$lib/jobType";
	import type { Job } from "$lib/types/job";

	type TrainingJobDetail = Extract<Job, { jobType: JobType.Training }>;

	let { job, stepsTaken }: { job: TrainingJobDetail; stepsTaken: number } = $props();

	type StageSegmentVariant = "done" | "failed" | "remaining";
	interface StageSegment {
		variant: StageSegmentVariant;
		weight: number;
	}

	function statusNote(status: JobStatus): string {
		switch (status) {
			case JobStatus.Pending:
				return "queued for a runner";
			case JobStatus.Running:
				return "in progress";
			case JobStatus.CompletedSuccess:
				return "finished";
			case JobStatus.CompletedFailed:
				return "failed — reached max steps";
			case JobStatus.CompletedCancelled:
				return "cancelled";
			case JobStatus.InterventionRequested:
				return "needs intervention";
			case JobStatus.CompletedError:
				return "error";
		}
	}

	function formatDuration(ms: number): string {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
	}

	function formatTiming(job: Job): string {
		if (!job.startedAt) {
			return `created ${job.createdAt.toLocaleString()}`;
		}

		const endTime = job.completedAt ?? new Date();
		const elapsedLabel = job.completedAt ? "duration" : "elapsed";
		return `started ${job.startedAt.toLocaleString()} · ${elapsedLabel} ${formatDuration(endTime.getTime() - job.startedAt.getTime())}`;
	}

	function computeSegments(status: JobStatus, stepsTaken: number, maxSteps: number): StageSegment[] {
		const done = Math.min(stepsTaken, maxSteps);
		const remaining = Math.max(maxSteps - done, 0);
		const remainingVariant: StageSegmentVariant = status === JobStatus.CompletedFailed || status === JobStatus.CompletedCancelled ? "failed" : "remaining";

		const segments: StageSegment[] = [];
		if (done > 0) segments.push({ variant: "done", weight: done });
		if (remaining > 0) segments.push({ variant: remainingVariant, weight: remaining });
		return segments.length > 0 ? segments : [{ variant: "remaining", weight: 1 }];
	}

	const label = $derived(`Step ${stepsTaken} of ${job.details.maxSteps}`);
	const note = $derived(statusNote(job.jobStatusId));
	const timing = $derived(formatTiming(job));
	const segments = $derived(computeSegments(job.jobStatusId, stepsTaken, job.details.maxSteps));
</script>

<div class="stage">
	<div class="stage-row">
		<span class="stage-label">{label} <span class="stage-note">— {note}</span></span>
		<span class="stage-timing">{timing}</span>
	</div>
	<div class="stage-bar">
		{#each segments as segment, index (index)}
			<div class={`stage-segment stage-segment-${segment.variant}`} style:flex={segment.weight}></div>
		{/each}
	</div>
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.stage {
		@include panel;

		margin-top: $space-m;
		padding: 15px $space-m;
	}

	.stage-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: $space-l;
		font-family: $font-family-ui;
	}

	.stage-label {
		font-size: $text-regular-size;
		font-weight: 600;
	}

	.stage-note {
		font-weight: $text-regular-weight;
		color: $text-color-muted;
	}

	.stage-timing {
		font-family: $font-family-mono;
		font-size: $text-regular-size;
		color: $text-color-muted;
	}

	.stage-bar {
		@include status-bar;

		margin-top: 10px;
	}

	.stage-segment-done {
		@include status-bar-segment-done;
	}

	.stage-segment-failed {
		@include status-bar-segment-failed;
	}

	.stage-segment-remaining {
		@include status-bar-segment-remaining;
	}
</style>
