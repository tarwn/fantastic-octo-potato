<script lang="ts">
	let {
		open,
		onClose,
		text,
		imageUrl
	}: {
		open: boolean;
		onClose: () => void;
		text: string;
		imageUrl: string;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | undefined>();

	$effect(() => {
		if (!dialogEl) return;

		if (open && !dialogEl.open) {
			dialogEl.showModal();
		}
		else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});
</script>

<dialog bind:this={dialogEl} class="overlay" onclose={onClose}>
	{#if open}
		<div class="overlay-header">
			<p class="overlay-text">{text}</p>
			<button type="button" class="overlay-close" onclick={() => dialogEl?.close()}>Close</button>
		</div>
		<img class="overlay-image" src={imageUrl} alt={text} />
	{/if}
</dialog>

<style lang="scss">
	@use "../../../../lib/styles/mixins" as *;
	@use "../../../../lib/styles/variables" as *;

	.overlay {
		@include panel;

		box-shadow: $box-shadow-overlay;
		box-sizing: border-box;
		width: calc(100vw - 40px);
		max-width: none;
		height: calc(100vh - 40px);
		max-height: none;
		padding: $panel-body-padding;

		&[open] {
			display: flex;
			flex-direction: column;
			gap: $space-m;
		}

		&::backdrop {
			background-color: $overlay-backdrop-color;
		}
	}

	.overlay-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: $space-m;
	}

	.overlay-text {
		margin: 0;
		font-family: $font-family-mono;
		font-size: $text-regular-size;
	}

	.overlay-close {
		@include button-base;
		@include button-variant-secondary;

		flex: none;
	}

	.overlay-image {
		display: block;
		flex: 1;
		min-height: 0;
		max-width: 100%;
		object-fit: contain;
	}
</style>
