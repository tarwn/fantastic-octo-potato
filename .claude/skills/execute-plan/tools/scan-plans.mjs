#!/usr/bin/env node
// Scans plan.md files matched by a glob pattern for checkbox task lines
// (`- [ ]` / `- [x]`, top-level or indented) and prints one summary line per
// file: "- <incomplete>/<total> incomplete: <absolute path>". By default
// only plans with incomplete tasks are printed; pass --all to print every
// matched plan regardless of completion (useful for testing).
// Usage: node scan-plans.mjs <glob-pattern> [--all]
import { glob, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const all = args.includes("--all");
const pattern = args.find((arg) => arg !== "--all");
if (!pattern) {
	// eslint-disable-next-line no-console
	console.error("Usage: node scan-plans.mjs <glob-pattern> [--all]");
	process.exit(1);
}

const checkboxLine = /^[ \t]*-\s\[([ xX])\]/;

async function scanFile(path) {
	const content = await readFile(path, "utf8");
	let total = 0;
	let incomplete = 0;
	for (const line of content.split("\n")) {
		const match = line.match(checkboxLine);
		if (!match) {
			continue;
		}
		total += 1;
		if (match[1] === " ") {
			incomplete += 1;
		}
	}
	return { total, incomplete };
}

const files = [];
for await (const file of glob(pattern)) {
	files.push(file);
}
files.sort();

const results = [];
for (const file of files) {
	const { total, incomplete } = await scanFile(file);
	results.push({ path: resolve(file).replace(/\\/g, "/"), total, incomplete });
}

for (const { path, total, incomplete } of results) {
	if (!all && incomplete === 0) {
		continue;
	}
	// eslint-disable-next-line no-console
	console.log(`- ${incomplete}/${total} incomplete: ${path}`);
}
