<script lang="ts">
	import type { SharedComponentProps } from "./sharedComponentProps";

	const navItems = ["Customers", "Runners", "Jobs"];

	// no route exists yet for any of these sections; plain labels until
	// Customers/Runners/Jobs-list routes land.
	let { active, class: className }: SharedComponentProps & { active?: string } = $props();
</script>

<header class={["chrome", className].filter(Boolean).join(" ")}>
	<div class="chrome-left">
		<span class="chrome-wordmark">HUB</span>
		<nav class="chrome-nav">
			{#each navItems as item (item)}
				<span class={["chrome-nav-item", item === active && "chrome-nav-item-active"]}>{item}</span>
			{/each}
		</nav>
	</div>
	<div class="chrome-right">
		<span class="chrome-env">STAGING</span>
		<span class="chrome-user">r.okafor@acme.internal</span>
	</div>
</header>

<style lang="scss">
	@use "../styles/mixins" as *;
	@use "../styles/variables" as *;

	// this bar has no design-system mixin/tokens yet — reusing the closest
	// existing palette steps as a deliberate local exception until the design
	// system defines chrome-specific tokens.
	$chrome-nav-color: $color-stone-500;
	$chrome-nav-active-color: $surface-color-page;

	.chrome {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 50px;
		padding: 0 $space-l;
		background-color: $surface-color-chrome;
		color: $text-color-inverse;
	}

	.chrome-left {
		display: flex;
		align-items: center;
		gap: $space-l;
	}

	.chrome-wordmark {
		font-family: $font-family-mono;
		font-size: $text-regular-size;
		font-weight: 700;
		letter-spacing: $text-micro-letter-spacing;
	}

	.chrome-nav {
		display: flex;
		gap: $space-m;
		font-size: $text-regular-size;
		color: $chrome-nav-color;
	}

	.chrome-nav-item-active {
		font-weight: 600;
		color: $chrome-nav-active-color;
	}

	.chrome-right {
		display: flex;
		align-items: center;
		gap: $space-m;
		font-size: $text-small-size;
	}

	.chrome-env {
		font-family: $font-family-mono;
		font-weight: 700;
		letter-spacing: $text-micro-letter-spacing;
		color: $color-ochre-600;
	}

	.chrome-user {
		color: $chrome-nav-color;
	}
</style>
