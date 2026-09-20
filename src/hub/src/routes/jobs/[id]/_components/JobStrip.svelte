<script lang="ts">
	import type { JobStatus } from "$lib/jobStatus";
	import { JOB_STATUS_LABELS, JOB_STATUS_VARIANTS } from "$lib/jobStatus";

	let {
		customerName,
		applicationName,
		runnerId,
		jobStatusId
	}: { customerName: string; applicationName: string; runnerId: number | null; jobStatusId: JobStatus } = $props();
</script>

<div class="strip">
	<div>
		<div class="strip-label">Customer</div>
		<div class="strip-value strip-value-strong">{customerName}</div>
	</div>
	<div>
		<div class="strip-label">Application</div>
		<div class="strip-value">{applicationName}</div>
	</div>
	<div>
		<div class="strip-label">Runner</div>
		<div class="strip-value strip-runner">{runnerId === null ? "Unassigned" : `Runner ${runnerId}`}</div>
	</div>
	<div class={["strip-status", `strip-status-${JOB_STATUS_VARIANTS[jobStatusId]}`]}>
		<div class="strip-label">Status</div>
		<div class="strip-value strip-status-value">
			<span class="strip-status-dot"></span>
			{JOB_STATUS_LABELS[jobStatusId]}
		</div>
	</div>
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.strip {
		@include panel-strip(1.2fr 1fr 1fr 1fr);

		margin-top: $space-m;
	}

	.strip-label {
		@include panel-strip-label;
	}

	.strip-value {
		@include panel-strip-value;
	}

	.strip-value-strong {
		font-weight: 700;
	}

	.strip-runner {
		font-family: $font-family-mono;
		font-size: $text-mono-regular-size;
	}

	.strip-status-value {
		display: flex;
		align-items: center;
		gap: $space-xs;
		font-weight: 700;
	}

	.strip-status-dot {
		@include status-dot(currentcolor);
	}

	.strip-status-pending {
		@include panel-strip-status-cell($status-pending-color, $status-pending-surface);
	}

	.strip-status-running {
		@include panel-strip-status-cell($status-running-color, $status-running-surface);
	}

	.strip-status-success {
		@include panel-strip-status-cell($status-success-color, $status-success-surface);
	}

	.strip-status-failed {
		@include panel-strip-status-cell($status-failed-color, $status-failed-surface);
	}

	.strip-status-cancelled {
		@include panel-strip-status-cell($status-cancelled-color, $status-cancelled-surface);
	}

	.strip-status-intervention {
		@include panel-strip-status-cell($status-intervention-color, $status-intervention-surface);
	}

	.strip-status-error {
		@include panel-strip-status-cell($status-error-color, $status-error-surface);
	}
</style>
