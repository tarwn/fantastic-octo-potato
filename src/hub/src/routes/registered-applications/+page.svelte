<script lang="ts">
	import { onMount } from "svelte";

	import { resolve } from "$app/paths";
	import { fetchRegisteredApplications } from "$lib/api/registeredApplicationsApi";
	import type { RegisteredApplication } from "$lib/types/registeredApplication";

	let registeredApplications = $state<RegisteredApplication[]>([]);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			registeredApplications = await fetchRegisteredApplications();
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load registered applications";
		}
	});
</script>

<svelte:head>
	<title>Registered Applications · Hub</title>
</svelte:head>

<div class="page">
	<h1>Registered Applications</h1>
	<div class="panel">
		<div class="panel-header">
			<h2>All registered applications</h2>
		</div>
		{#if loadError}
			<p class="panel-message">{loadError}</p>
		{:else if registeredApplications.length === 0}
			<p class="panel-message">No registered applications yet.</p>
		{:else}
			<ul class="panel-rows registered-application-list">
				{#each registeredApplications as registeredApplication (registeredApplication.id)}
					<li class="panel-row">
						<a href={resolve("/registered-applications/[id]", { id: String(registeredApplication.id) })}>
							{registeredApplication.customerName} — {registeredApplication.applicationName}
						</a>
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

	.registered-application-list {
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
