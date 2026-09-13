<script lang="ts">
	import type { ResultField } from "./jobTypes";

	import RedactedValue from "$lib/components/RedactedValue.svelte";

	let { meta, results }: { meta: string; results: ResultField[] } = $props();
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Results</h2>
		<span class="panel-meta">{meta}</span>
	</div>
	<div class="panel-rows">
		{#each results as field (field.label)}
			<div class="panel-row">
				<span class="panel-label">
					{field.label}
					{#if field.sensitive}<span class="redacted-tag">PII</span>{/if}
				</span>
				{#if field.pending}
					<span class="panel-value panel-value-pending">pending</span>
				{:else if field.redacted}
					<RedactedValue value={field.value} />
				{:else}
					<span class="panel-value">{field.value}</span>
				{/if}
			</div>
		{/each}
	</div>
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

	.redacted-tag {
		@include redacted-tag;
	}
</style>
