<script lang="ts">
	import { onMount } from "svelte";

	import RegisteredApplicationsPanel from "./_components/RegisteredApplicationsPanel.svelte";

	import { page } from "$app/state";
	import { fetchCustomer } from "$lib/api/customersApi";
	import { fetchJobs } from "$lib/api/jobsApi";
	import InterventionJobsPanel from "$lib/components/InterventionJobsPanel.svelte";
	import type { CustomerDetail } from "$lib/types/customer";
	import type { Job } from "$lib/types/job";

	let customer = $state<CustomerDetail | null>(null);
	let jobs = $state<Job[]>([]);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		try {
			const loadedCustomer = await fetchCustomer(Number(page.params.id));
			const registeredApplicationIds = loadedCustomer.registeredApplications.map((application) => application.id);
			jobs = (await fetchJobs()).filter((job) => registeredApplicationIds.includes(job.customerApplicationXrefId));
			customer = loadedCustomer;
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load customer";
		}
	});
</script>

<svelte:head>
	<title>{customer ? `${customer.name} · Hub` : "Customer · Hub"}</title>
</svelte:head>

<div class="page">
	{#if loadError}
		<p class="page-message">{loadError}</p>
	{:else if customer}
		<h1>{customer.name}</h1>
		<InterventionJobsPanel {jobs} />
		<RegisteredApplicationsPanel registeredApplications={customer.registeredApplications} />
	{/if}
</div>

<style lang="scss">
	@use "../../../lib/styles/mixins" as *;
	@use "../../../lib/styles/variables" as *;

	.page {
		padding: $space-l;
	}

	.page-message {
		@include panel-body;

		margin: 0;
	}

	h1 {
		margin: 0 0 $space-m;
		font-size: $text-h1-size;
		font-weight: $text-h1-weight;
		line-height: $text-h1-line-height;
		letter-spacing: $text-h1-letter-spacing;
	}
</style>
