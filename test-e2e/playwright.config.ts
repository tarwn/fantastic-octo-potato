import { defineConfig } from "@playwright/test";

const HUB_PORT = 4173;

// Starts hub the same way src/hub/playwright.config.ts does; runner-web has no HTTP
// server of its own to point a webServer entry at, so specs spawn it directly instead
// (see runner-startup.spec.ts) to capture and assert on its console output.
export default defineConfig({
	webServer: {
		command: "npm run build:hub && npm run preview:hub",
		cwd: "..",
		port: HUB_PORT,
		env: {
			HUB_DATABASE_URL: "sqlite:.data/hub.e2e.db",
			// Hub doesn't read these yet; harmless no-ops until it does.
			RUNNER_SHARED_SECRET: "test-e2e-shared-secret",
			RUNNER_POLL_INTERVAL_SECONDS: "1",
			RUNNER_INTERVENTION_TIMEOUT_SECONDS: "5"
		}
	},
	use: { baseURL: `http://localhost:${HUB_PORT}` },
	testDir: "."
});
