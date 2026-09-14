import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.integration.test.ts"],
		// dbmate spawns a real subprocess per test file's beforeAll; give it room on slower machines.
		testTimeout: 15000
	}
});
