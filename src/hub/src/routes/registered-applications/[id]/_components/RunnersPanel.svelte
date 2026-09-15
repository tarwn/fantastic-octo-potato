<script lang="ts">
	import { getRunnerStatus } from "$lib/runnerStatus";
	import type { RunnerSummary } from "$lib/types/registeredApplication";

	let { runners }: { runners: RunnerSummary[] } = $props();

	function formatHeartbeat(lastHeartbeatOn: Date | null): string {
		return lastHeartbeatOn === null ? "Never" : lastHeartbeatOn.toLocaleString();
	}

	function statusLabel(lastHeartbeatOn: Date | null): string {
		return getRunnerStatus(lastHeartbeatOn, new Date()) === "alive" ? "Alive" : "Idle";
	}
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Runners</h2>
	</div>
	{#if runners.length === 0}
		<p class="panel-message">No runners registered yet.</p>
	{:else}
		<ul class="panel-rows runner-list">
			{#each runners as runner (runner.id)}
				{@const status = statusLabel(runner.lastHeartbeatOn)}
				<li class="panel-row">
					<span class="panel-row-label">Runner {runner.id}</span>
					<span class="panel-row-value">
						<span class={["runner-status", `runner-status--${status.toLowerCase()}`].join(" ")}>
							{status}
						</span>
						Last heartbeat: {formatHeartbeat(runner.lastHeartbeatOn)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

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

	.runner-list {
		@include panel-rows;

		margin: 0;
		padding: 0;
		list-style: none;
	}

	.panel-row {
		@include panel-row;
	}

	.panel-row-label {
		@include panel-row-label;
	}

	.panel-row-value {
		@include panel-row-value;
	}

	.runner-status {
		font-weight: 600;

		&--alive {
			color: $text-color-primary;
		}

		&--idle {
			color: $text-color-muted;
		}
	}
</style>
