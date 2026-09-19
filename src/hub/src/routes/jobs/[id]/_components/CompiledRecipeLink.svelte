<script lang="ts">
	import { resolve } from "$app/paths";
	import type { RecipeSummary } from "$lib/api/recipesApi";

	let {
		recipe,
		registeredApplicationId
	}: { recipe: Pick<RecipeSummary, "id" | "name"> | null; registeredApplicationId: number } = $props();
</script>

{#if recipe}
	<a
		class="compiled-recipe-link"
		href={resolve("/registered-applications/[id]/recipes/[recipeId]", {
			id: String(registeredApplicationId),
			recipeId: String(recipe.id)
		})}
	>
		Draft Recipe created: {recipe.name}
	</a>
{/if}

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.compiled-recipe-link {
		font-family: $font-family-ui;
		font-size: $text-small-size;
		color: $text-color-primary;
	}
</style>
