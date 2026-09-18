import { spawnSync } from "node:child_process";
import os from "node:os";

// Playwright launches its browsers from its own cache directory (`ms-playwright`), so matching on
// that path in each running process's command line is what keeps this script from ever touching a
// developer's ordinary, unrelated Chrome windows.
const MARKER = "ms-playwright";

function findWindowsPids(): string[] {
	const command = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*ms-playwright*' } | Select-Object -ExpandProperty ProcessId";
	const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`Failed to list processes: ${result.stderr}`);
	}
	return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findPosixPids(): string[] {
	const result = spawnSync("ps", ["-eo", "pid,command"], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`Failed to list processes: ${result.stderr}`);
	}
	return result.stdout
		.split("\n")
		.filter((line) => line.includes(MARKER))
		.map((line) => line.trim().split(/\s+/)[0])
		.filter(Boolean);
}

function killPid(pid: string): boolean {
	const result = os.platform() === "win32"
		? spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { encoding: "utf8" })
		: spawnSync("kill", ["-9", pid], { encoding: "utf8" });
	if (result.status !== 0) {
		console.error(`Failed to kill pid ${pid}: ${result.stderr?.trim() || result.error?.message || "unknown error"}`);
		return false;
	}
	return true;
}

const pids = os.platform() === "win32" ? findWindowsPids() : findPosixPids();

if (pids.length === 0) {
	console.log("No stray Playwright browser processes found.");
	process.exit(0);
}

let killedCount = 0;
for (const pid of pids) {
	if (killPid(pid)) {
		killedCount++;
	}
}

console.log(`Killed ${killedCount}/${pids.length} stray Playwright browser process(es).`);

if (killedCount < pids.length) {
	process.exit(1);
}
