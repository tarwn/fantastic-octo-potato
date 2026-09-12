#!/usr/bin/env node
// Given the path to a prior review.md, copies the report template into the
// same folder as re-review-<YYMMDD-hhmmss>.md (local time) and prints the
// new file's path.
// Usage: node start-re-review.mjs <path-to-prior-review.md>
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const priorReviewPath = process.argv[2];
if (!priorReviewPath) {
	// eslint-disable-next-line no-console
	console.error("Usage: node start-re-review.mjs <path-to-prior-review.md>");
	process.exit(1);
}

function pad(n) {
	return String(n).padStart(2, "0");
}

const now = new Date();
const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const toolsDir = dirname(fileURLToPath(import.meta.url));
const templatePath = join(toolsDir, "..", "templates", "code-review.template.md");

const outDir = dirname(priorReviewPath);
const outPath = join(outDir, `re-review-${stamp}.md`);
copyFileSync(templatePath, outPath);

// eslint-disable-next-line no-console
console.log(outPath);
