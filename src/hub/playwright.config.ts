import { defineConfig } from "@playwright/test";

export default defineConfig({
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
