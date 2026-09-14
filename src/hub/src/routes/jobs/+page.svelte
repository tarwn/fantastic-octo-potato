<svelte:head>
	<title>Jobs · Hub</title>
</svelte:head>

<div class="page">
	<h1>Jobs</h1>
	<div class="panel">
		<p class="panel-message">No jobs yet.</p>
	</div>
</div>

<style lang="scss">
	@use "../../lib/styles/mixins" as *;
	@use "../../lib/styles/variables" as *;

	.page {
		padding: $space-l;
	}

	h1 {
		margin: 0 0 $space-m;
		font-size: $text-h1-size;
		font-weight: $text-h1-weight;
		line-height: $text-h1-line-height;
		letter-spacing: $text-h1-letter-spacing;
	}

	.panel {
		@include panel;
	}

	.panel-message {
		@include panel-body;

		margin: 0;
	}
</style>
