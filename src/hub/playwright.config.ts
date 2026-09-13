import { defineConfig } from "@playwright/test";

export default defineConfig({
	webServer: { command: "npm run build:hub && npm run preview:hub", cwd: "../..", port: 4173 },
	testDir: "e2e"
});
