#!/usr/bin/env node
// Writes .git/review_summary.json. branch/head_sha/range/reviewed_at are
// always freshly computed here from git, never taken as arguments, so the
// pre-push staleness check can't be fed a stale or fabricated value.
// Usage: node write-summary.mjs --critical N --warning N --suggestion N
//   --missing-context N --files-reviewed N --files-excluded a.json,b.lock
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

function git(args) {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function tryGit(args) {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	}
	catch {
		return "";
	}
}

function arg(name, fallback) {
	const idx = process.argv.indexOf(`--${name}`);
	return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const headSha = git(["rev-parse", "HEAD"]);
const upstream = tryGit(["rev-parse", "--abbrev-ref", "@{upstream}"]);
const base = upstream || "origin/main";
const range = `${base}...HEAD`;
const reviewedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const filesExcluded = (arg("files-excluded", "") || "").split(",").filter(Boolean);

const summary = {
	branch,
	range,
	head_sha: headSha,
	reviewed_at: reviewedAt,
	counts: {
		critical: Number(arg("critical", "0")),
		warning: Number(arg("warning", "0")),
		suggestion: Number(arg("suggestion", "0")),
		missing_context: Number(arg("missing-context", "0"))
	},
	files_reviewed: Number(arg("files-reviewed", "0")),
	files_excluded: filesExcluded
};

const gitDir = git(["rev-parse", "--git-dir"]);
const outPath = join(gitDir, "review_summary.json");
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
// eslint-disable-next-line no-console
console.log(`Wrote ${outPath}`);
