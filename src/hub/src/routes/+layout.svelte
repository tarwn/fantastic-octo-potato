<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";

	import { page } from "$app/state";
	import AppChrome from "$lib/components/AppChrome.svelte";

	let { children } = $props();

	const active = $derived(page.url.pathname.startsWith("/jobs") ? "Jobs" : undefined);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-grid">
	<div class="app-grid-header">
		<AppChrome {active} />
	</div>
	<div class="app-grid-content">
		{@render children()}
	</div>
	<div class="app-grid-footer"></div>
</div>

<style lang="scss">
	@use "../lib/styles/variables" as *;

	:global(body) {
		margin: 0;
		background-color: $surface-color-well;
		font-family: $font-family-ui;
		color: $text-color-default;
	}

	.app-grid {
		display: grid;
		grid-template-columns: 1fr minmax(0, 1240px) 1fr;
		grid-template-rows: auto 1fr $space-l;
		min-height: 100vh;
	}

	.app-grid-header {
		grid-column: 1 / -1;
		grid-row: 1;
	}

	.app-grid-content {
		grid-column: 2;
		grid-row: 2;
	}

	.app-grid-footer {
		grid-column: 1 / -1;
		grid-row: 3;
	}
</style>
