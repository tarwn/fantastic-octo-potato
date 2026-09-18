import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_LLM_STUB_PORT } from "./port.mjs";

// Mirrors target-app/run-compose.mjs's up/down CLI shape, but there's no daemon (docker) to hold
// the process for us, so a pidfile stands in for that: `up` records the detached server's pid,
// `down` reads it back and kills it.

const STUB_DIR = path.resolve(import.meta.dirname);
const PID_FILE = path.join(STUB_DIR, ".llm-stub.pid");
const PORT = process.env.LLM_STUB_PORT ?? String(DEFAULT_LLM_STUB_PORT);
const HEALTH_URL = `http://localhost:${PORT}/health`;

/** @param {number} timeoutMs */
async function waitForHealth(timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(HEALTH_URL);
			if (response.ok) {
				return;
			}
		}
		catch {
			// Not listening yet — retry until the deadline.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`llm stub did not become healthy within ${timeoutMs}ms`);
}

async function up() {
	const child = spawn(process.execPath, [path.join(STUB_DIR, "server.mjs")], {
		detached: true,
		stdio: "ignore",
		env: { ...process.env, LLM_STUB_PORT: PORT }
	});
	child.unref();
	writeFileSync(PID_FILE, String(child.pid));
	await waitForHealth(10_000);
}

function down() {
	if (!existsSync(PID_FILE)) {
		return;
	}
	const pid = Number(readFileSync(PID_FILE, "utf-8"));
	try {
		process.kill(pid);
	}
	catch {
		// Already gone.
	}
	rmSync(PID_FILE, { force: true });
}

const action = process.argv[2];
if (action === "up") {
	await up();
}
else if (action === "down") {
	down();
}
else {
	throw new Error(`Usage: node run.mjs <up|down>, got "${action}"`);
}
