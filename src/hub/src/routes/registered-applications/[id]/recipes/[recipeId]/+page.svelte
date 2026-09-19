<script lang="ts">
	import { onMount } from "svelte";

	import RecipeReview from "./_components/RecipeReview.svelte";

	import { page } from "$app/state";
	import { fetchRecipes, type RecipeSummary } from "$lib/api/recipesApi";

	let recipe = $state<RecipeSummary | null>(null);
	let loadError = $state<string | null>(null);

	async function load() {
		try {
			const recipeId = Number(page.params.recipeId);
			const recipes = await fetchRecipes(Number(page.params.id));
			const found = recipes.find((candidate) => candidate.id === recipeId);
			if (!found) {
				loadError = `Recipe ${page.params.recipeId} not found`;
				return;
			}
			recipe = found;
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load Recipe";
		}
	}

	onMount(load);
</script>

<svelte:head>
	<title>{recipe ? `${recipe.name} · Hub` : "Recipe · Hub"}</title>
</svelte:head>

{#if loadError}
	<p class="page-message">{loadError}</p>
{:else if recipe}
	<RecipeReview name={recipe.name} goal={recipe.goal} definition={recipe.definition} />
{/if}

<style lang="scss">
	@use "../../../../../lib/styles/mixins" as *;

	.page-message {
		@include panel-body;

		margin: 0;
	}
</style>
