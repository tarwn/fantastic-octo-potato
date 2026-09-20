<script lang="ts">
	import type { SharedComponentProps } from "../sharedComponentProps";

	import Self from "./ConditionDescription.svelte";
	import TargetDescription from "./TargetDescription.svelte";
	import ValueDescription from "./ValueDescription.svelte";

	import type { CompositeCondition, Condition } from "$lib/types/recipeDefinition";

	let { condition, class: className }: SharedComponentProps & { condition: Condition } = $props();

	function isComposite(candidate: Condition): candidate is CompositeCondition {
		return candidate.test === "all" || candidate.test === "any";
	}
</script>

{#if isComposite(condition)}
	<span class={["condition-composite", className]} data-testid="condition-composite">
		{condition.test} of
		{#each condition.args as inner, index (index)}
			<span class="condition-nested"><Self condition={inner} /></span>
		{/each}
	</span>
{:else if condition.test === "assigned"}
	<span class={className} data-testid="condition">assigned <ValueDescription value={condition.args[0]} /></span>
{:else}
	<span class={className} data-testid="condition">{condition.test} <TargetDescription locator={condition.args[0]} /></span>
{/if}

<style lang="scss">
	@use "../../styles/variables" as *;

	.condition-composite {
		display: inline-flex;
		flex-direction: column;
	}

	.condition-nested {
		padding-left: $space-m;
	}
</style>
