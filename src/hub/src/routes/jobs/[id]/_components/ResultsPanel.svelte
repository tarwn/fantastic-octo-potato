<script lang="ts">
	import RedactedValue from "$lib/components/RedactedValue.svelte";
	import type { JobResult } from "$lib/types/job";

	let { results }: { results: JobResult[] } = $props();
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Results</h2>
		<span class="panel-meta">{results.length} collected</span>
	</div>
	{#if results.length === 0}
		<p class="panel-message">No results yet.</p>
	{:else}
		<div class="panel-rows">
			{#each results as result (result.fieldName)}
				<div class="panel-row">
					<span class="panel-label">{result.fieldName}</span>
					{#if result.pending}
						<span class="panel-value panel-value-pending">pending</span>
					{:else if result.redacted}
						<RedactedValue value={result.value} />
					{:else}
						<span class="panel-value">{result.value}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;

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

	.panel-rows {
		@include panel-rows;
	}

	.panel-row {
		@include panel-row;
	}

	.panel-label {
		@include panel-row-label;
	}

	.panel-value {
		@include panel-row-value;

		&-pending {
			@include panel-row-value-pending;
		}
	}
</style>
