<script lang="ts">
	let { status = "ready" }: { status?: string } = $props();
</script>

<span class="status-badge" data-testid="status-badge">Hub status: {status}</span>

<style lang="scss">
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		background-color: rgb(230 244 234);
		color: rgb(30 126 52);
		font-weight: 600;
	}
</style>
