#!/usr/bin/env node
// Runs the "identify outstanding changes" git steps for a given comparison
// base and prints structured JSON: branch, base, range, clean (working tree
// status), commits (hash + oneline summary), and files touched.
// Usage: node prepare-for-pull-request.mjs <comparison-base>
import { execFileSync } from "node:child_process";

function git(args) {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function tryGit(args) {
	try {
		return { ok: true, out: execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() };
	}
	catch {
		return { ok: false, out: "" };
	}
}

const base = process.argv[2];
if (!base) {
	console.error("Usage: node prepare-for-pull-request.mjs <comparison-base>");
	process.exit(1);
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const status = git(["status", "--porcelain"]);
const clean = status.length === 0;

const [remote] = base.split("/");
git(["fetch", remote]);

const upstream = tryGit(["rev-parse", "--abbrev-ref", "@{upstream}"]);
if (upstream.ok && upstream.out) {
	git(["push"]);
}
else {
	git(["push", "-u", remote, branch]);
}

const range = `${base}...HEAD`;

const commits = git(["log", `${base}..HEAD`, "--format=%H\t%s"])
	.split("\n")
	.filter(Boolean)
	.map((line) => {
		const [hash, summary] = line.split("\t");

		return { hash, summary };
	});

const files = git(["diff", range, "--name-only"]).split("\n").filter(Boolean);

// eslint-disable-next-line no-console
console.log(JSON.stringify({ branch, base, range, clean, commits, files }, null, 2));
