import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter(),

			// compiles <style lang="scss"> blocks so components can @use the design-system tokens/mixins.
			preprocess: vitePreprocess()
		})
	],
	test: {
		environment: "jsdom",
		include: ["src/**/*.test.ts"],
		// Real-database integration tests (npm run guard:hub:test-integration) live in
		// vite.integration.config.ts instead, so this run stays fast and resource-free.
		exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
		setupFiles: ["./vitest-setup.ts"]
	},
	resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined
});
