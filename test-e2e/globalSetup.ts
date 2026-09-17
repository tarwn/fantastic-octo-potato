import { execFileSync } from "node:child_process";
import path from "node:path";

const TARGET_APP_DIR = path.resolve(import.meta.dirname, "..", "target-app");

// Started once for the whole test-e2e run (not per spec file) — starting/stopping target-app's
// containers repeatedly, back to back, within one run was leaving the next spec's containers in a
// bad state (port/network reuse races between an `up` and the previous spec's `down`).
export default function globalSetup(): void {
	execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "up"], { stdio: "inherit" });
}
