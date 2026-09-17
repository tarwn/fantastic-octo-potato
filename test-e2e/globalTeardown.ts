import { execFileSync } from "node:child_process";
import path from "node:path";

const TARGET_APP_DIR = path.resolve(import.meta.dirname, "..", "target-app");

// Pairs with globalSetup.ts — stops target-app's containers once, after the whole test-e2e run.
export default function globalTeardown(): void {
	execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "down"], { stdio: "inherit" });
}
