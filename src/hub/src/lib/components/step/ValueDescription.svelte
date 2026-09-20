<script lang="ts">
	import type { SharedComponentProps } from "../sharedComponentProps";

	import type { Value } from "$lib/types/recipeDefinition";

	let { value, class: className }: SharedComponentProps & { value: Value } = $props();

	const REF_LABELS = { input: "input", credential: "cred", output: "output" } as const;
</script>

{#if value !== null && typeof value === "object"}
	<span class={["step-ref", className]} data-testid={`value-${value.ref}`}>{REF_LABELS[value.ref]}: {value.name}</span>
{:else}
	<span class={["step-plain-value", className]} data-testid="value-plain">{String(value)}</span>
{/if}

<style lang="scss">
	@use "../../styles/variables" as *;

	.step-plain-value {
		color: $text-color-light;
		border-bottom: 1px solid $color-stone-400;
	}

	.step-ref {
		display: inline-block;
		padding: 0 $space-xs;
		background-color: $color-stone-200;
		border: 1px solid $color-stone-400;
		font-family: $font-family-mono;
		color: $text-color-default;
		white-space: nowrap;
	}
</style>
