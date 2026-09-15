import { spawnSync } from "node:child_process";
import path from "node:path";

// Per spec 0005 C004: developers run either Docker or Podman across machines, so this
// auto-detects the available compose command instead of hardcoding `docker compose`.
const CANDIDATES = [
	{ command: "docker", args: ["compose", "version"] },
	{ command: "podman", args: ["compose", "version"] },
	{ command: "podman-compose", args: ["version"] }
];

function findComposeCommand() {
	for (const candidate of CANDIDATES) {
		const result = spawnSync(candidate.command, candidate.args, { stdio: "ignore" });
		if (!result.error && result.status === 0) {
			return candidate.command === "podman-compose"
				? ["podman-compose"]
				: [candidate.command, "compose"];
		}
	}
	throw new Error("No compose command found. Install Docker (with the compose plugin) or Podman (with podman compose / podman-compose).");
}

const action = process.argv[2];
if (action !== "up" && action !== "down") {
	throw new Error(`Usage: node run-compose.mjs <up|down>, got "${action}"`);
}

const composeCommand = findComposeCommand();
const composeArgs = action === "up" ? ["up", "-d", "--build"] : ["down"];
const cwd = path.resolve(import.meta.dirname);

const result = spawnSync(composeCommand[0], [...composeCommand.slice(1), ...composeArgs], {
	cwd,
	stdio: "inherit"
});

process.exit(result.status ?? 1);
