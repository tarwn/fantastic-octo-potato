<script lang="ts">
	import type { SharedComponentProps } from "../sharedComponentProps";

	import ValueDescription from "./ValueDescription.svelte";

	import type { Target } from "$lib/types/recipeDefinition";

	// Not named `target`: testing-library's render() treats that prop as the mount point.
	let { locator, class: className }: SharedComponentProps & { locator: Target } = $props();
</script>

{#if locator.by === "point"}
	<span class={`target ${className ?? ""}`} data-testid="target-point">{locator.x},{locator.y}</span>
{:else}
	<span class={`target ${className ?? ""}`} data-testid="target-element">{locator.by}{locator.by === "text" && locator.exact === false ? " containing" : ""}
		{#if typeof locator.value === "string"}"{locator.value}"{:else}<ValueDescription value={locator.value} />{/if}</span>
{/if}

<style lang="scss">
	@use "../../styles/variables" as *;

	.target {
		color: $text-color-light;
		background-color: $color-stone-100;
		padding: 0 $space-xs;
		border: 1px solid $color-stone-400;
	}
	</style>
