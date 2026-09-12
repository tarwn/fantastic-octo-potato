#!/usr/bin/env node
// Determines the comparison base (upstream, or origin/main if none), fetches
// it, and prints review metadata as JSON: branch, headSha, base, range, log,
// stat, files, reviewedAt. Read-only aside from `git fetch`.
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

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const headSha = git(["rev-parse", "HEAD"]);

const upstream = tryGit(["rev-parse", "--abbrev-ref", "@{upstream}"]);
const base = upstream.ok && upstream.out ? upstream.out : "origin/main";

if (base === "origin/main") {
	git(["fetch", "origin", "main"]);
}
else {
	const remoteResult = tryGit(["for-each-ref", "--format=%(upstream:remotename)", `refs/heads/${branch}`]);
	const remote = remoteResult.ok && remoteResult.out ? remoteResult.out : git(["config", `branch.${branch}.remote`]);
	git(["fetch", remote]);
}

const range = `${base}...HEAD`;
const log = tryGit(["log", "--oneline", `${base}..HEAD`]).out;
const stat = git(["diff", range, "--stat"]);
const files = git(["diff", range, "--name-only"]).split("\n").filter(Boolean);
const reviewedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

// eslint-disable-next-line no-console
console.log(JSON.stringify({ branch, headSha, base, range, log, stat, files, reviewedAt }, null, 2));
