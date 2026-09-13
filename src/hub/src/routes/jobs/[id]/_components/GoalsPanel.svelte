<script lang="ts">
	import type { JobGoals } from "./jobTypes";

	let { goals }: { goals: JobGoals } = $props();
</script>

<div class="panel">
	<div class="panel-header">
		<h2>Goals</h2>
	</div>
	<p class="panel-description">{goals.description}</p>
	<p class="panel-allowlist">allowlist: {goals.allowlist}</p>
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

	.panel-description {
		@include panel-body;

		margin: 0;
	}

	.panel-allowlist {
		margin: 0;
		padding: 0 $space-m $space-s;
		font-family: $font-family-mono;
		font-size: $text-small-size;
		color: $text-color-muted;
	}
</style>
