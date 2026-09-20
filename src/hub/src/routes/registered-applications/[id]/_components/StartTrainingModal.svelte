<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { startTrainingRun } from "$lib/api/jobsApi";

	let { open, onClose, registeredApplicationId }: { open: boolean; onClose: () => void; registeredApplicationId: number } =
		$props();

	let dialogEl = $state<HTMLDialogElement | undefined>();

	let goal = $state("");
	let startingUrl = $state("");
	let maxSteps = $state("");
	let alternateGoals = $state("");
	let syntheticDataConfirmed = $state(false);

	let goalError = $state<string | null>(null);
	let startingUrlError = $state<string | null>(null);
	let maxStepsError = $state<string | null>(null);
	let submitError = $state<string | null>(null);

	$effect(() => {
		if (!dialogEl) return;

		if (open && !dialogEl.open) {
			resetForm();
			dialogEl.showModal();
		}
		else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	function resetForm() {
		goal = "";
		startingUrl = "";
		maxSteps = "";
		alternateGoals = "";
		syntheticDataConfirmed = false;
		goalError = null;
		startingUrlError = null;
		maxStepsError = null;
		submitError = null;
	}

	function parseAlternateGoals(value: string): string[] {
		return value
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "");
	}

	function isValidUrl(value: string): boolean {
		try {
			new URL(value);
			return true;
		}
		catch {
			return false;
		}
	}

	function isPositiveInteger(value: string): boolean {
		return /^[1-9]\d*$/.test(value);
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		submitError = null;
		goalError = goal.trim() === "" ? "Goal statement is required." : null;
		startingUrlError = startingUrl.trim() === ""
			? "Starting URL is required."
			: isValidUrl(startingUrl) ? null : "Enter a valid URL.";
		maxStepsError = maxSteps.trim() === ""
			? "Maximum steps is required."
			: isPositiveInteger(maxSteps) ? null : "Maximum steps must be a positive whole number.";

		if (goalError || startingUrlError || maxStepsError) return;

		try {
			const job = await startTrainingRun(registeredApplicationId, {
				goal,
				startingUrl,
				maxSteps: Number(maxSteps),
				alternateGoals: parseAlternateGoals(alternateGoals),
				syntheticDataConfirmed
			});
			dialogEl?.close();
			await goto(resolve("/jobs/[id]", { id: String(job.id) }));
		}
		catch (err) {
			submitError = err instanceof Error ? err.message : "Failed to start the Training Run.";
		}
	}

	function handleCancel() {
		dialogEl?.close();
	}
</script>

<dialog bind:this={dialogEl} class="modal" onclose={onClose}>
	<form class="modal-form" novalidate onsubmit={handleSubmit}>
		<h2>Start Training Run</h2>

		<label class="field">
			<span class="field-label">Primary goal statement</span>
			<textarea
				class="field-input"
				rows="3"
				bind:value={goal}
				aria-invalid={!!goalError}
				aria-describedby={goalError ? "goal-error" : undefined}
			></textarea>
			{#if goalError}<span id="goal-error" class="field-error">{goalError}</span>{/if}
		</label>

		<label class="field">
			<span class="field-label">Starting URL</span>
			<input
				class="field-input"
				type="url"
				bind:value={startingUrl}
				aria-invalid={!!startingUrlError}
				aria-describedby={startingUrlError ? "starting-url-error" : undefined}
			/>
			{#if startingUrlError}<span id="starting-url-error" class="field-error">{startingUrlError}</span>{/if}
		</label>

		<label class="field">
			<span class="field-label">Maximum steps</span>
			<input
				class="field-input"
				type="text"
				bind:value={maxSteps}
				aria-invalid={!!maxStepsError}
				aria-describedby={maxStepsError ? "max-steps-error" : undefined}
			/>
			{#if maxStepsError}<span id="max-steps-error" class="field-error">{maxStepsError}</span>{/if}
		</label>

		<label class="field">
			<span class="field-label">Alternate goals (optional, one per line)</span>
			<textarea class="field-input" rows="2" bind:value={alternateGoals}></textarea>
		</label>

		<label class="field field-checkbox">
			<input type="checkbox" bind:checked={syntheticDataConfirmed} />
			<span class="field-label">This data is synthetic/non-sensitive</span>
		</label>

		{#if submitError}<span class="field-error">{submitError}</span>{/if}

		<div class="modal-actions">
			<button type="button" class="btn btn-secondary" onclick={handleCancel}>Cancel</button>
			<button type="submit" class="btn btn-primary">Start Training Run</button>
		</div>
	</form>
</dialog>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.modal {
		@include panel;

		box-shadow: $box-shadow-overlay;
		width: 420px;
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

	.field-checkbox {
		flex-direction: row;
		align-items: center;
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
