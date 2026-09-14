<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RegisteredApplicationSummary } from "$lib/types/customer";

	let { registeredApplications }: { registeredApplications: RegisteredApplicationSummary[] } = $props();
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Registered Applications</h2>
	</div>
	{#if registeredApplications.length === 0}
		<p class="panel-message">No registered applications yet.</p>
	{:else}
		<ul class="panel-rows app-list">
			{#each registeredApplications as registeredApplication (registeredApplication.id)}
				<li class="panel-row">
					<a href={resolve("/registered-applications/[id]", { id: String(registeredApplication.id) })}>
						{registeredApplication.applicationName}
					</a>
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

	.app-list {
		@include panel-rows;

		margin: 0;
		padding: 0;
		list-style: none;
	}

	.panel-row {
		@include panel-row;
	}

	a {
		color: $anchor-default-color;
	}
</style>
