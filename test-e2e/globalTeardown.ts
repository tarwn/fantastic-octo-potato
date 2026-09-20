import { execFileSync } from "node:child_process";
import path from "node:path";

const TARGET_APP_DIR = path.resolve(import.meta.dirname, "..", "target-app");
const LLM_STUB_DIR = path.resolve(import.meta.dirname, "llm-stub");

// Pairs with globalSetup.ts — stops target-app's containers and the LLM stub once, after the
// whole test-e2e run.
export default function globalTeardown(): void {
	execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "down"], { stdio: "inherit" });
	execFileSync(process.execPath, [path.join(LLM_STUB_DIR, "run.mjs"), "down"], { stdio: "inherit" });
}
