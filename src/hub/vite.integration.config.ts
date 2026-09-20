import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// No SvelteKit Vite plugin here to provide the real virtual module (vite.config.ts has
			// it) — see src/lib/server/_test/envDynamicPrivateShim.ts for why this is safe.
			"$env/dynamic/private": "./src/lib/server/_test/envDynamicPrivateShim.ts"
		}
	},
	test: {
		environment: "node",
		include: ["src/**/*.integration.test.ts"],
		// dbmate spawns a real subprocess per test file's beforeAll; give it room on slower machines.
		testTimeout: 15000
	}
});
