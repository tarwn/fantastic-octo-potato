<script lang="ts">
	import { onMount } from "svelte";

	import RecipesPanel from "./_components/RecipesPanel.svelte";
	import RunnersPanel from "./_components/RunnersPanel.svelte";
	import StartRecipeJobModal from "./_components/StartRecipeJobModal.svelte";
	import StartTrainingModal from "./_components/StartTrainingModal.svelte";

	import { page } from "$app/state";
	import { fetchRecipes, type RecipeSummary } from "$lib/api/recipesApi";
	import { fetchRegisteredApplication } from "$lib/api/registeredApplicationsApi";
	import type { RegisteredApplicationDetail } from "$lib/types/registeredApplication";

	let registeredApplication = $state<RegisteredApplicationDetail | null>(null);
	let recipes = $state<RecipeSummary[]>([]);
	let loadError = $state<string | null>(null);
	let trainingModalOpen = $state(false);
	let recipeModalMode = $state<"Trial" | "Execute" | null>(null);
	let recipeModalRecipeId = $state<number | null>(null);
	let lastRefreshedOn = $state(new Date());

	async function load() {
		try {
			registeredApplication = await fetchRegisteredApplication(Number(page.params.id));
			recipes = await fetchRecipes(registeredApplication.id);
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load registered application";
		}
	}

	onMount(load);

	async function refresh() {
		await load();
		lastRefreshedOn = new Date();
	}

	function beginTrainingRun() {
		trainingModalOpen = true;
	}

	function closeTrainingModal() {
		trainingModalOpen = false;
	}

	function closeRecipeModal() {
		recipeModalMode = null;
		recipeModalRecipeId = null;
	}

	function startTrial(recipeId: number) {
		recipeModalRecipeId = recipeId;
		recipeModalMode = "Trial";
	}

	function startJob(recipeId: number) {
		recipeModalRecipeId = recipeId;
		recipeModalMode = "Execute";
	}
</script>

<svelte:head>
	<title>
		{registeredApplication ? `${registeredApplication.applicationName} · Hub` : "Registered Application · Hub"}
	</title>
</svelte:head>

<div class="page">
	{#if loadError}
		<p class="page-message">{loadError}</p>
	{:else if registeredApplication}
		<div class="page-header">
			<h1>{registeredApplication.customerName} — {registeredApplication.applicationName}</h1>
			<div class="page-actions">
				<button type="button" class="btn btn-primary" onclick={beginTrainingRun}>Begin a Training Run</button>
			</div>
		</div>
		<RunnersPanel
			runners={registeredApplication.runners}
			xrefId={registeredApplication.id}
			{lastRefreshedOn}
			onRefresh={refresh}
		/>
		<RecipesPanel {recipes} registeredApplicationId={registeredApplication.id} onStartTrial={startTrial} onStartJob={startJob} />
		<StartTrainingModal
			open={trainingModalOpen}
			onClose={closeTrainingModal}
			registeredApplicationId={registeredApplication.id}
		/>
		<StartRecipeJobModal
			open={recipeModalMode !== null}
			onClose={closeRecipeModal}
			registeredApplicationId={registeredApplication.id}
			mode={recipeModalMode ?? "Trial"}
			initialRecipeId={recipeModalRecipeId}
		/>
	{/if}
</div>

<style lang="scss">
	@use "../../../lib/styles/mixins" as *;
	@use "../../../lib/styles/variables" as *;

	.page {
		padding: $space-l;
	}

	.page-message {
		@include panel-body;

		margin: 0;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-l;
		margin-bottom: $space-m;
	}

	.page-actions {
		display: flex;
		align-items: center;
		gap: $space-s;
		flex: none;
	}

	h1 {
		margin: 0;
		font-size: $text-h1-size;
		font-weight: $text-h1-weight;
		line-height: $text-h1-line-height;
		letter-spacing: $text-h1-letter-spacing;
	}

	.btn-primary {
		@include button-base;
		@include button-variant-primary;

		flex: none;
	}
</style>
