<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RecipeSummary } from "$lib/api/recipesApi";

	let {
		recipes,
		registeredApplicationId,
		onStartTrial,
		onStartJob
	}: {
		recipes: RecipeSummary[];
		registeredApplicationId: number;
		onStartTrial: (recipeId: number) => void;
		onStartJob: (recipeId: number) => void;
	} = $props();

	// "Newest first" is approximated by descending id — Recipe ids are assigned in insertion
	// order, so this avoids widening RecipeSummary with a createdAt just for sorting.
	const orderedRecipes = $derived([
		...recipes.filter((recipe) => recipe.state === "Draft").sort((a, b) => b.id - a.id),
		...recipes.filter((recipe) => recipe.state === "Published").sort((a, b) => b.id - a.id)
	]);
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Recipes</h2>
	</div>
	{#if orderedRecipes.length === 0}
		<p class="panel-message">No Recipes yet.</p>
	{:else}
		<div class="panel-rows">
			{#each orderedRecipes as recipe (recipe.id)}
				<div class="panel-row">
					<a
						class="recipe-link"
						href={resolve("/registered-applications/[id]/recipes/[recipeId]", {
							id: String(registeredApplicationId),
							recipeId: String(recipe.id)
						})}
					>
						{recipe.name}
					</a>
					{#if recipe.state === "Draft"}
						<button type="button" class="btn btn-secondary" onclick={() => onStartTrial(recipe.id)}>Start Trial</button>
					{:else}
						<button type="button" class="btn btn-secondary" onclick={() => onStartJob(recipe.id)}>Start Job</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

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

	.panel-rows {
		@include panel-rows;
	}

	.panel-row {
		@include panel-row;

		justify-content: space-between;
	}

	.recipe-link {
		font-family: $font-family-ui;
		font-size: $text-regular-size;
		color: $text-color-primary;
	}

	.btn-secondary {
		@include button-base;
		@include button-variant-secondary;

		flex: none;
	}
</style>
