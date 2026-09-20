<script lang="ts">
	import RecipeStateBadge from "../../../_components/RecipeStateBadge.svelte";

	import type { RecipeSummary } from "$lib/api/recipesApi";
	import StepDescription from "$lib/components/step/StepDescription.svelte";
	import type { FieldDeclaration, RecipeDefinition } from "$lib/types/recipeDefinition";

	let {
		name: recipeName,
		goal,
		state,
		qualifiedByJobId,
		definition,
		onPublish
	}: {
		name: string;
		goal: string;
		state: RecipeSummary["state"];
		qualifiedByJobId: number | null;
		definition: RecipeDefinition;
		onPublish: () => void;
	} = $props();

	function fieldRows(fields: Record<string, FieldDeclaration>): [string, FieldDeclaration][] {
		return Object.entries(fields);
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>{recipeName}</h1>
		<RecipeStateBadge {state} {qualifiedByJobId} />
		{#if state === "Draft"}
			<button type="button" class="btn btn-primary" disabled={qualifiedByJobId === null} onclick={onPublish}>Publish</button>
		{/if}
	</div>
	<p class="goal">{goal}</p>

	<div class="panel">
		<div class="panel-header">
			<h2>Steps</h2>
		</div>
		<div class="panel-rows">
			{#each definition.steps as step (step.id)}
				<div class="panel-row">
					<span class="panel-label">{step.intent ?? step.id}</span>
					<StepDescription {step} class="panel-value" />
					{#if step.irreversible}<span class="badge-irreversible">Irreversible</span>{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="panel">
		<div class="panel-header">
			<h2>Inputs</h2>
		</div>
		<div class="panel-rows">
			{#each fieldRows(definition.inputs) as [name, declaration] (name)}
				<div class="panel-row">
					<span class="panel-label">{name}</span>
					<span class="panel-value">{declaration.type}</span>
					{#if declaration.sensitive}<span class="badge-sensitive">Sensitive</span>{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="panel">
		<div class="panel-header">
			<h2>Outputs</h2>
		</div>
		<div class="panel-rows">
			{#each fieldRows(definition.outputs) as [name, declaration] (name)}
				<div class="panel-row">
					<span class="panel-label">{name}</span>
					<span class="panel-value">{declaration.type}</span>
					{#if declaration.sensitive}<span class="badge-sensitive">Sensitive</span>{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	@use "../../../../../../lib/styles/mixins" as *;
	@use "../../../../../../lib/styles/variables" as *;

	.page {
		display: flex;
		flex-direction: column;
		gap: $space-m;
		padding: $space-l;
	}

	.page-header {
		display: flex;
		align-items: center;
		gap: $space-s;

		.btn-primary {
			margin-left: auto;
		}
	}

	.btn-primary {
		@include button-base;
		@include button-variant-primary;

		flex: none;
	}

	h1 {
		margin: 0;
		font-size: $text-h1-size;
		font-weight: $text-h1-weight;
		line-height: $text-h1-line-height;
		letter-spacing: $text-h1-letter-spacing;
	}

	.goal {
		margin: 0;
		font-family: $font-family-ui;
		font-size: $text-regular-size;
		color: $text-color-muted;
	}

	.panel {
		@include panel;
	}

	.panel-header {
		@include panel-header;
	}

	.panel-rows {
		@include panel-rows;
	}

	.panel-row {
		@include panel-row;

		justify-content: flex-start;

		.panel-label:nth-child(1) {
			color: $text-color-default;
			width: 18rem;
		}
	}

	.panel-label {
		@include panel-row-label;
	}

	:global(.panel-value) {
		color: $text-color-light;
	}

	.badge-irreversible {
		padding: 2px $space-xs;
		font-size: $text-micro-size;
		font-weight: 700;
		letter-spacing: $text-micro-letter-spacing;
		color: $status-failed-color;
		background-color: $status-failed-surface;
		border-radius: $border-small-radius;
	}

	.badge-sensitive {
		padding: 2px $space-xs;
		font-size: $text-micro-size;
		font-weight: 700;
		letter-spacing: $text-micro-letter-spacing;
		color: $text-color-muted;
		background-color: $surface-color-card;
		border-radius: $border-small-radius;
	}
</style>
