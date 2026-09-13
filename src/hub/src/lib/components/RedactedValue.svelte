<script lang="ts">
	import type { SharedComponentProps } from "./sharedComponentProps";

	let { value, class: className }: SharedComponentProps & { value: string } = $props();
</script>

<span class={["redacted", className].filter(Boolean).join(" ")}>{value}</span>

<style lang="scss">
	@use "../styles/mixins" as *;

	.redacted {
		@include redacted;
	}
</style>
