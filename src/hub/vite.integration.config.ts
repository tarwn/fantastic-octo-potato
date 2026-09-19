import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.integration.test.ts"],
		// dbmate spawns a real subprocess per test file's beforeAll; give it room on slower machines.
		testTimeout: 15000,
		// Vitest's default isolation spawns a fresh forked process per test file, and each
		// fresh fork reloading the better-sqlite3 native addon intermittently crashes on
		// Windows (STATUS_DLL_INIT_FAILED). Sharing one worker avoids the repeated reload.
		isolate: false,
		// These tests are subprocess (dbmate) and IO-bound, not CPU-bound, so running them
		// one at a time in the shared worker avoids resource contention at no real cost.
		fileParallelism: false
	}
});
