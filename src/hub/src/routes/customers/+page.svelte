<script lang="ts">
	import { onMount } from "svelte";

	import { resolve } from "$app/paths";
	import { fetchCustomers } from "$lib/api/customersApi";
	import type { Customer } from "$lib/types/customer";

	let customers = $state<Customer[]>([]);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			customers = await fetchCustomers();
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load customers";
		}
	});
</script>

<svelte:head>
	<title>Customers · Hub</title>
</svelte:head>

<div class="page">
	<h1>Customers</h1>
	<div class="panel">
		<div class="panel-header">
			<h2>All customers</h2>
		</div>
		{#if loadError}
			<p class="panel-message">{loadError}</p>
		{:else if customers.length === 0}
			<p class="panel-message">No customers yet.</p>
		{:else}
			<ul class="panel-rows customer-list">
				{#each customers as customer (customer.id)}
					<li class="panel-row">
						<a href={resolve("/customers/[id]", { id: String(customer.id) })}>{customer.name}</a>
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

	.customer-list {
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
