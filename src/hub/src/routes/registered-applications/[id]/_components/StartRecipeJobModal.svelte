<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { fetchRecipes, type RecipeSummary, startRecipeJob } from "$lib/api/recipesApi";
	import StepDescription from "$lib/components/step/StepDescription.svelte";
	import type { FieldDeclaration } from "$lib/types/recipeDefinition";

	let {
		open,
		onClose,
		registeredApplicationId,
		mode,
		initialRecipeId = null
	}: {
		open: boolean;
		onClose: () => void;
		registeredApplicationId: number;
		mode: "Trial" | "Execute";
		initialRecipeId?: number | null;
	} = $props();

	const recipeState = $derived(mode === "Trial" ? "Draft" : "Published");
	const title = $derived(mode === "Trial" ? "Start Trial" : "Start Job");

	let dialogEl = $state<HTMLDialogElement | undefined>();

	let recipes = $state<RecipeSummary[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let selectedRecipeId = $state<number | null>(null);
	let ingredientValues = $state<Record<string, string>>({});
	let fieldErrors = $state<Record<string, string>>({});
	let submitError = $state<string | null>(null);

	const selectedRecipe = $derived(recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null);

	$effect(() => {
		if (!dialogEl) return;

		if (open && !dialogEl.open) {
			resetForm();
			dialogEl.showModal();
			load();
		}
		else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	async function load() {
		loadError = null;
		loading = true;
		try {
			const all = await fetchRecipes(registeredApplicationId);
			recipes = all.filter((recipe) => recipe.state === recipeState);
			const preselected = initialRecipeId !== null && recipes.some((recipe) => recipe.id === initialRecipeId) ? initialRecipeId : null;
			selectedRecipeId = preselected ?? recipes[0]?.id ?? null;
		}
		catch (err) {
			loadError = err instanceof Error ? err.message : "Failed to load Recipes";
		}
		finally {
			loading = false;
		}
	}

	function resetForm() {
		recipes = [];
		loadError = null;
		selectedRecipeId = null;
		ingredientValues = {};
		fieldErrors = {};
		submitError = null;
	}

	// A boolean field's checkbox starts unchecked without ever writing to ingredientValues — treat
	// that as an explicit "false" rather than "not yet provided", so a required boolean field
	// doesn't demand the user toggle it just to submit its default value.
	function rawFieldValue(name: string, declaration: FieldDeclaration): string {
		const raw = (ingredientValues[name] ?? "").trim();
		return raw === "" && declaration.type === "boolean" ? "false" : raw;
	}

	function parseFieldValue(declaration: FieldDeclaration, raw: string): string | number | boolean {
		if (declaration.type === "number") return Number(raw);
		if (declaration.type === "boolean") return raw === "true";
		return raw;
	}

	function validate(recipe: RecipeSummary): Record<string, string> {
		const errors: Record<string, string> = {};
		for (const [name, declaration] of Object.entries(recipe.definition.inputs)) {
			const raw = rawFieldValue(name, declaration);
			if (raw === "") {
				if (declaration.required) errors[name] = `${name} is required.`;
				continue;
			}
			if (declaration.type === "number" && Number.isNaN(Number(raw))) {
				errors[name] = `${name} must be a number.`;
				continue;
			}
			if (declaration.enum && !declaration.enum.includes(raw)) {
				errors[name] = `${name} must be one of: ${declaration.enum.join(", ")}.`;
			}
		}
		return errors;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		submitError = null;

		const recipe = selectedRecipe;
		if (!recipe) {
			submitError = "Select a Recipe to continue.";
			return;
		}

		fieldErrors = validate(recipe);
		if (Object.keys(fieldErrors).length > 0) return;

		const ingredients: Record<string, string | number | boolean | null> = {};
		for (const [name, declaration] of Object.entries(recipe.definition.inputs)) {
			const raw = rawFieldValue(name, declaration);
			if (raw === "") continue;
			ingredients[name] = parseFieldValue(declaration, raw);
		}

		try {
			const job = await startRecipeJob(recipe.id, { mode, ingredients });
			dialogEl?.close();
			await goto(resolve("/jobs/[id]", { id: String(job.id) }));
		}
		catch (err) {
			submitError = err instanceof Error ? err.message : `Failed to ${title.toLowerCase()}.`;
		}
	}

	function handleCancel() {
		dialogEl?.close();
	}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onClose}>
	<form class="modal-form" novalidate onsubmit={handleSubmit}>
		<h2>{title}</h2>

		{#if loading}
			<p class="modal-empty">Loading Recipes...</p>
		{:else if loadError}
			<span class="field-error">{loadError}</span>
		{:else if recipes.length === 0}
			<p class="modal-empty">No {recipeState.toLowerCase()} Recipes are available.</p>
		{:else}
			<label class="field">
				<span class="field-label">Recipe</span>
				<select class="field-input" bind:value={selectedRecipeId}>
					{#each recipes as recipe (recipe.id)}
						<option value={recipe.id}>{recipe.name}</option>
					{/each}
				</select>
			</label>

			{#if selectedRecipe}
				{#each Object.entries(selectedRecipe.definition.inputs) as [name, declaration] (name)}
					<label class="field">
						<span class="field-label">{name}{declaration.required ? " *" : ""}</span>
						{#if declaration.type === "boolean"}
							<input
								type="checkbox"
								checked={ingredientValues[name] === "true"}
								onchange={(event) => (ingredientValues[name] = (event.currentTarget as HTMLInputElement).checked ? "true" : "false")}
								aria-invalid={!!fieldErrors[name]}
								aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
							/>
						{:else}
							<input
								class="field-input"
								type="text"
								value={ingredientValues[name] ?? ""}
								oninput={(event) => (ingredientValues[name] = (event.currentTarget as HTMLInputElement).value)}
								aria-invalid={!!fieldErrors[name]}
								aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
							/>
						{/if}
						{#if fieldErrors[name]}<span id={`${name}-error`} class="field-error">{fieldErrors[name]}</span>{/if}
					</label>
				{/each}

				<div class="steps-review">
					<span class="field-label">Steps</span>
					<ul class="steps-list">
						{#each selectedRecipe.definition.steps as step (step.id)}
							<li class="steps-item">
								<span>{step.intent ?? step.id}</span>
								<StepDescription {step} />
								{#if step.irreversible}<span class="badge-irreversible">Irreversible</span>{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

		{#if submitError}<span class="field-error">{submitError}</span>{/if}

		<div class="modal-actions">
			<button type="button" class="btn btn-secondary" onclick={handleCancel}>Cancel</button>
			<button type="submit" class="btn btn-primary" disabled={recipes.length === 0}>{title}</button>
		</div>
	</form>
</dialog>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.modal {
		@include panel;

		box-shadow: $box-shadow-overlay;
		width: 600px;
		max-width: calc(100vw - #{$space-xl});
		padding: 0;

		&::backdrop {
			background-color: $overlay-backdrop-color;
		}
	}

	.modal-form {
		display: flex;
		flex-direction: column;
		gap: $space-m;
		padding: $panel-body-padding;
		max-height: 80vh;
		overflow-y: auto;
	}

	h2 {
		margin: 0;
		font-family: $font-family-ui;
		font-size: $panel-header-font-size;
		font-weight: $panel-header-font-weight;
	}

	.modal-empty {
		margin: 0;
		font-family: $font-family-ui;
		font-size: $text-regular-size;
		color: $text-color-muted;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: $space-xs;
	}

	.field-label {
		font-family: $font-family-ui;
		font-size: $text-small-size;
		font-weight: 600;
		color: $text-color-light;
	}

	.field-input {
		box-sizing: border-box;
		padding: $space-s;
		font-family: $font-family-ui;
		font-size: $text-regular-size;
		color: $text-color-default;
		background-color: $surface-color-card;
		border: $border-hairline-width solid $border-color-control;
		border-radius: $border-small-radius;

		&:focus-visible {
			outline: $button-all-focus-outline;
			outline-offset: 1px;
		}
	}

	.field-error {
		font-family: $font-family-ui;
		font-size: $text-small-size;
		color: $status-failed-color;
	}

	.steps-review {
		display: flex;
		flex-direction: column;
		gap: $space-xs;
	}

	.steps-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: $space-xs;
	}

	.steps-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-s;
		padding: $space-xs $space-s;
		font-family: $font-family-ui;
		font-size: $text-small-size;
		background-color: $surface-color-card;
		border-radius: $border-small-radius;
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

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: $space-s;
	}

	.btn-secondary {
		@include button-base;
		@include button-variant-secondary;
	}

	.btn-primary {
		@include button-base;
		@include button-variant-primary;
	}
</style>
