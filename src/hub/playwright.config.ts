import { defineConfig } from "@playwright/test";

export default defineConfig({
	webServer: {
		command: "npm run build:hub && npm run preview:hub",
		cwd: "../..",
		port: 4173,
		env: { HUB_DATABASE_URL: "sqlite:.data/hub.e2e.db" }
	},
	testDir: "e2e"
});
