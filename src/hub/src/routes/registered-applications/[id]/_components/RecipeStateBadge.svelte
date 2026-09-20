<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RecipeSummary } from "$lib/api/recipesApi";

	let { state, qualifiedByJobId }: { state: RecipeSummary["state"]; qualifiedByJobId: number | null } = $props();
</script>

{#if state === "Draft" && qualifiedByJobId !== null}
	<a class="badge badge-qualified" href={resolve("/jobs/[id]", { id: String(qualifiedByJobId) })}>Trial passed</a>
{:else if state === "Draft"}
	<span class="badge">Not yet qualified</span>
{:else}
	<span class="badge">{state}</span>
{/if}

<style lang="scss">
	@use "../../../../lib/styles/variables" as *;

	.badge {
		padding: 2px $space-xs;
		font-family: $font-family-ui;
		font-size: $text-micro-size;
		font-weight: 700;
		letter-spacing: $text-micro-letter-spacing;
		color: $text-color-muted;
		background-color: $surface-color-card;
		border-radius: $border-small-radius;
	}

	.badge-qualified {
		color: $status-success-color;
		background-color: $status-success-surface;
	}
</style>
