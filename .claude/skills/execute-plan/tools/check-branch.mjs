#!/usr/bin/env node
// Checks the current git branch and reports whether it is safe to continue.
// Exits 0 with "Ready to continue" when not on `main`, or exits 1 with
// "Cannot continue, on main branch" when on `main`.
// Usage: node check-branch.mjs
import { execFileSync } from "node:child_process";

const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();

if (branch === "main") {
	// eslint-disable-next-line no-console
	console.log("Cannot continue, on main branch");
	process.exit(1);
}

// eslint-disable-next-line no-console
console.log("Ready to continue");
process.exit(0);
