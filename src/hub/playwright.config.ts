import { defineConfig } from "@playwright/test";

export default defineConfig({
	// All specs share one seeded Customer/Application/Runner (see seed.ts) and the same
	// webServer's sqlite file, with no per-test reset — job-claiming/heartbeat tests would
	// race each other under file-level parallelism, so this whole suite runs serially.
	workers: 1,
	webServer: {
		// db:reset first so state-mutating tests (e.g. runner heartbeat) don't leak between runs.
		command: "npm run db:reset && npm run build:hub && npm run preview:hub",
		cwd: "../..",
		port: 4173,
		env: { HUB_DATABASE_URL: "sqlite:.data/hub.e2e.db", RUNNER_SHARED_SECRET: "change-me" }
	},
	use: { baseURL: "http://localhost:4173" },
	testDir: "e2e"
});
