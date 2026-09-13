<script lang="ts">
	import type { SharedComponentProps } from "./sharedComponentProps";
	import type { StatusVariant } from "./statusVariants";

	let {
		text,
		variant = "running",
		class: className
	}: SharedComponentProps & { text: string; variant?: StatusVariant } = $props();
</script>

<span
	class={["status-badge", `status-badge-${variant}`, className].filter(Boolean).join(" ")}
	data-testid="status-badge"
>
	{text}
</span>

<style lang="scss">
	@use "../styles/mixins" as *;

	.status-badge {
		@include status-change;

		&-pending {
			@include status-change-pending;
		}

		&-running {
			@include status-change-running;
		}

		&-intervention {
			@include status-change-intervention;
		}

		&-interactive {
			@include status-change-interactive;
		}

		&-success {
			@include status-change-success;
		}

		&-failed {
			@include status-change-failed;
		}

		&-error {
			@include status-change-error;
		}

		&-stale {
			@include status-change-stale;
		}

		&-cancelled {
			@include status-change-cancelled;
		}
	}
</style>
