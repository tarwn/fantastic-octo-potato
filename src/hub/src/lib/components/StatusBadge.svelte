<script lang="ts">
	let { status = "ready" }: { status?: string } = $props();
</script>

<span class="status-badge" data-testid="status-badge">Hub status: {status}</span>

<style lang="scss">
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		background-color: #e6f4ea;
		color: #1e7e34;
		font-weight: 600;
	}
</style>
