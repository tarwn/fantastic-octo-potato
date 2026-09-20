<script lang="ts">
	import type { SharedComponentProps } from "../sharedComponentProps";

	import ConditionDescription from "./ConditionDescription.svelte";
	import Self from "./StepDescription.svelte";
	import TargetDescription from "./TargetDescription.svelte";
	import ValueDescription from "./ValueDescription.svelte";

	import type { Condition, Step } from "$lib/types/recipeDefinition";

	let { step, class: className }: SharedComponentProps & { step: Step } = $props();

	function unknownAction(unhandled: never): never {
		throw new Error(`No description for step action: ${JSON.stringify(unhandled)}`);
	}
</script>

{#snippet conditionBox(condition: Condition)}
	<span class="step-condition-wrapper" data-testid="step-condition-wrapper"><ConditionDescription {condition} /></span>
{/snippet}

<div class={["step-description", className]} data-testid="step-description">
	{#if step.action === "open"}
		open <ValueDescription value={step.args[0]} />
	{:else if step.action === "click" || step.action === "focus" || step.action === "scrollIntoView"}
		{step.action} <TargetDescription locator={step.args[0]} />
	{:else if step.action === "scroll"}
		scroll {step.args[0]},{step.args[1]}
	{:else if step.action === "fill"}
		fill <TargetDescription locator={step.args[0]} /> from <ValueDescription value={step.args[1]} />
	{:else if step.action === "select"}
		select <TargetDescription locator={step.args[0]} />
		{#each step.args[1] as option, index (index)}
			{option.by} <ValueDescription value={option.value} />
		{/each}
	{:else if step.action === "read"}
		read <TargetDescription locator={step.args[0]} /> to <ValueDescription value={step.args[2]} />
	{:else if step.action === "check" || step.action === "verify"}
		{step.action}: {@render conditionBox(step.args[0])}
	{:else if step.action === "assign"}
		assign <ValueDescription value={step.args[0]} /> from <ValueDescription value={step.args[1]} />
	{:else if step.action === "goto"}
		goto <ValueDescription value={step.args[0]} />
	{:else if step.action === "fail"}
		fail {step.args[0]}: {step.args[1]}
	{:else if step.action === "finish"}
		finish
		{#if step.args[0] !== null}when: {@render conditionBox(step.args[0])}{/if}
	{:else if step.action === "group"}
		group
		<ul class="step-children">
			{#each step.args[0] as child (child.id)}
				<li><Self step={child} /></li>
			{/each}
		</ul>
	{:else if step.action === "if"}
		{#each step.args[0] as ifCase, index (index)}
			<span data-testid="step-if-case">if {@render conditionBox(ifCase.when)}</span>
			<ul class="step-children">
				{#each ifCase.steps as child (child.id)}
					<li><Self step={child} /></li>
				{/each}
			</ul>
		{/each}
		{#if step.args[1].length > 0}
			<span data-testid="step-else">else</span>
			<ul class="step-children">
				{#each step.args[1] as child (child.id)}
					<li><Self step={child} /></li>
				{/each}
			</ul>
		{/if}
	{:else}
		{unknownAction(step)}
	{/if}
</div>

<style lang="scss">
	@use "../../styles/variables" as *;

	.step-condition-wrapper {
		display: inline-flex;
		flex-direction: column;
		gap: $space-xs;
	}

	.step-description {
		display: inline;
	}

	.step-children {
		margin: 0;
		padding-left: $space-l;
		list-style: none;
	}
</style>
