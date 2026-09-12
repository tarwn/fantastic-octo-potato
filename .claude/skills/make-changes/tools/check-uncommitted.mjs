#!/usr/bin/env node
// Checks `git status --porcelain` for uncommitted *.ts, *.svelte, or *.scss
// files (staged or unstaged, excluding untracked-but-ignored). Prints each
// matching line and exits 1 if any are found, so the make-changes skill can
// gate on a plain exit code instead of parsing prose output.
// Usage: node check-uncommitted.mjs
import { execFileSync } from "node:child_process";

const trackedExtensions = /\.(ts|svelte|scss)$/;

// Assumes porcelain v1's fixed 3-char "XY " prefix and splits renames on the
// literal " -> " separator — good enough for this repo's paths, but would
// mis-split a path containing that exact substring, and doesn't unescape
// quoted paths (core.quotepath). Switch to `--porcelain=v1 -z` if that ever
// matters here.
function statusPaths(line) {
	const path = line.slice(3);
	const arrow = path.indexOf(" -> ");
	return arrow === -1 ? [path] : [path.slice(0, arrow), path.slice(arrow + 4)];
}

const output = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
const matches = output
	.split("\n")
	.filter(Boolean)
	.flatMap((line) => statusPaths(line).map((path) => ({ status: line.slice(0, 2), path })))
	.filter(({ path }) => trackedExtensions.test(path));

if (matches.length > 0) {
	for (const { status, path } of matches) {
		// eslint-disable-next-line no-console
		console.log(`${status} ${path}`);
	}
	process.exit(1);
}
