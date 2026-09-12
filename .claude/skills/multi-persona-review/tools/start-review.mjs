#!/usr/bin/env node
// Creates .tmp/code-review/<branch>-<YYMMDD-hhmmss>/ (local time) and copies
// the report template into it as review.md, then prints the new file's path.
// Usage: node start-review.mjs <branch>
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const branchArg = process.argv[2];
if (!branchArg) {
	// eslint-disable-next-line no-console
	console.error("Usage: node start-review.mjs <branch>");
	process.exit(1);
}
const branch = branchArg.replace(/\//g, "-");

function pad(n) {
	return String(n).padStart(2, "0");
}

const now = new Date();
const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const toolsDir = dirname(fileURLToPath(import.meta.url));
const templatePath = join(toolsDir, "..", "templates", "code-review.template.md");

const outDir = join(process.cwd(), ".tmp", "code-review", `${branch}-${stamp}`);
mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, "review.md");
copyFileSync(templatePath, outPath);

// eslint-disable-next-line no-console
console.log(outPath);
