#!/usr/bin/env node
// Prints the diff for <base>...HEAD, optionally scoped to specific paths
// passed as argv. Recomputes the base the same way get-context.mjs does, so
// it stays consistent without taking the base as a free-form argument.
// Usage: node diff-files.mjs [path ...]
import { execFileSync } from "node:child_process";

function git(args) {
	return execFileSync("git", args, { encoding: "utf8" });
}

function tryGit(args) {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	}
	catch {
		return "";
	}
}

const upstream = tryGit(["rev-parse", "--abbrev-ref", "@{upstream}"]);
const base = upstream || "origin/main";
const range = `${base}...HEAD`;

const files = process.argv.slice(2);
const args = ["diff", range, ...(files.length ? ["--", ...files] : [])];
process.stdout.write(git(args));
