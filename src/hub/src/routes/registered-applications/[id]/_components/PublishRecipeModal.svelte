<script lang="ts">
	import { publishRecipe, type RecipeSummary } from "$lib/api/recipesApi";
	import { MAX_RECIPE_NAME_LENGTH } from "$lib/recipeName";

	let {
		open,
		onClose,
		onPublished,
		recipe,
		publishedRecipes
	}: {
		open: boolean;
		onClose: () => void;
		onPublished: () => void;
		recipe: RecipeSummary;
		publishedRecipes: RecipeSummary[];
	} = $props();

	let dialogEl = $state<HTMLDialogElement | undefined>();

	let name = $state("");
	let replacesRecipeId = $state<number | null>(null);
	let nameError = $state<string | null>(null);
	let submitError = $state<string | null>(null);

	$effect(() => {
		if (!dialogEl) return;

		if (open && !dialogEl.open) {
			name = recipe.name;
			replacesRecipeId = null;
			nameError = null;
			submitError = null;
			dialogEl.showModal();
		}
		else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	function handleReplacesChange() {
		const replaced = publishedRecipes.find((candidate) => candidate.id === replacesRecipeId);
		name = replaced ? replaced.name : recipe.name;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		submitError = null;

		const trimmedName = name.trim();
		nameError = trimmedName === "" ? "Name is required." : null;
		if (nameError) return;

		try {
			await publishRecipe(recipe.id, replacesRecipeId === null ? { name: trimmedName } : { name: trimmedName, replacesRecipeId });
			dialogEl?.close();
			onPublished();
		}
		catch (err) {
			submitError = err instanceof Error ? err.message : "Failed to publish.";
		}
	}

	function handleCancel() {
		dialogEl?.close();
	}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onClose}>
	<form class="modal-form" novalidate onsubmit={handleSubmit}>
		<h2>Publish Recipe</h2>

		<label class="field">
			<span class="field-label">Name</span>
			<input class="field-input" type="text" maxlength={MAX_RECIPE_NAME_LENGTH} bind:value={name} aria-invalid={!!nameError} />
			{#if nameError}<span class="field-error">{nameError}</span>{/if}
		</label>

		<label class="field">
			<span class="field-label">Replaces</span>
			<select class="field-input" bind:value={replacesRecipeId} onchange={handleReplacesChange}>
				<option value={null}>None (new Recipe)</option>
				{#each publishedRecipes as published (published.id)}
					<option value={published.id}>{published.name}</option>
				{/each}
			</select>
		</label>

		{#if submitError}<span class="field-error">{submitError}</span>{/if}

		<div class="modal-actions">
			<button type="button" class="btn btn-secondary" onclick={handleCancel}>Cancel</button>
			<button type="submit" class="btn btn-primary">Publish</button>
		</div>
	</form>
</dialog>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.modal {
		@include panel;

		box-shadow: $box-shadow-overlay;
		width: 480px;
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
	}

	h2 {
		margin: 0;
		font-family: $font-family-ui;
		font-size: $panel-header-font-size;
		font-weight: $panel-header-font-weight;
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
