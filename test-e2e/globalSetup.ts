import { execFileSync } from "node:child_process";
import path from "node:path";

const TARGET_APP_DIR = path.resolve(import.meta.dirname, "..", "target-app");
const LLM_STUB_DIR = path.resolve(import.meta.dirname, "llm-stub");

// Started once for the whole test-e2e run (not per spec file) — starting/stopping target-app's
// containers repeatedly, back to back, within one run was leaving the next spec's containers in a
// bad state (port/network reuse races between an `up` and the previous spec's `down`).
export default async function globalSetup(): Promise<void> {
	execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "up"], { stdio: "inherit" });
	// The LLM stub (docs/specs/0009-training-run/spec.md Step 1) plays the model's role for
	// Training Run specs — same "start once for the whole run" reasoning as target-app above.
	execFileSync(process.execPath, [path.join(LLM_STUB_DIR, "run.mjs"), "up"], { stdio: "inherit" });
}
