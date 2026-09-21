import { defineConfig } from "@playwright/test";

import { DEFAULT_LLM_STUB_PORT } from "./llm-stub/port.mjs";

const HUB_PORT = 4173;

// Starts hub the same way src/hub/playwright.config.ts does; runner-web has no HTTP
// server of its own to point a webServer entry at, so specs spawn it directly instead
// (see runner-startup.spec.ts) to capture and assert on its console output.
export default defineConfig({
	// All specs share one Hub webServer, one seeded Runner (id 1), and now one shared target-app
	// (see globalSetup.ts) — running spec files in parallel raced multiple runner-web processes
	// against the same Hub/target-app state. Matches src/hub/playwright.config.ts's own workers:1
	// for the same reason.
	workers: 1,
	// target-app's containers are started/stopped once for the whole run, not per spec file
	// (see globalSetup.ts/globalTeardown.ts) — back-to-back up/down cycles across spec files
	// were leaving the next spec's containers in a bad state.
	globalSetup: "./globalSetup.ts",
	globalTeardown: "./globalTeardown.ts",
	webServer: {
		// db:migrate:up because a leftover e2e db can predate newer migrations; db:reset so Recipes/Jobs from an earlier run (or the Hub e2e suite, which shares this sqlite file) cannot leak in.
		command: "npm run db:migrate:up && npm run db:reset && npm run build:hub && npm run preview:hub",
		cwd: "..",
		port: HUB_PORT,
		env: {
			HUB_DATABASE_URL: "sqlite:.data/hub.e2e.db",
			// Runner-side config Hub hands back from `init` (runnerConfig.ts) — kept short here
			// so the intervention specs wait on this rather than the real default; long enough for a UI-driven take of control.
			RUNNER_SHARED_SECRET: "test-e2e-shared-secret",
			RUNNER_POLL_INTERVAL_SECONDS: "0.2",
			RUNNER_INTERVENTION_TIMEOUT_SECONDS: "8",
			// Points Hub's LLM client at the local stub server (llm-stub/, started by
			// globalSetup.ts) instead of a real provider endpoint.
			LLM_API_URL: `http://localhost:${DEFAULT_LLM_STUB_PORT}/v1`,
			LLM_API_KEY: "test-e2e-llm-key",
			LLM_MODEL: "test-e2e-llm-model"
		}
	},
	use: { baseURL: `http://localhost:${HUB_PORT}` },
	testDir: "."
});
