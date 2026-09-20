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
		// Fake credentials so any LLM call that slips past a mock fails against an unreachable
		// host instead of spending real tokens with a developer's shell or .env credentials.
		env: {
			LLM_API_URL: "http://127.0.0.1:1/v1",
			LLM_API_KEY: "test-fake-llm-key",
			LLM_MODEL: "test-fake-llm-model"
		},
		include: ["src/**/*.integration.test.ts"],
		// dbmate spawns a real subprocess per test file's beforeAll; give it room on slower machines.
		testTimeout: 15000,
		hookTimeout: 15000
	}
});
