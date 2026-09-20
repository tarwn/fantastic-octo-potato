import type Database from "better-sqlite3";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { openDb } from "../connection";
import { resetUserData } from "../reset";

const hubRoot = join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const scratchDir = join(hubRoot, ".data", "_test-scratch");
// .cmd shims need a shell on Windows to run at all; execSync always shells out, so this
// works cross-platform without the arg-escaping risk of execFile's shell:true + args array.
const dbmateBin = join(hubRoot, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "dbmate.cmd" : "dbmate");

// Migrates a real scratch sqlite file with the real dbmate CLI once per test file, then
// resets it (via the real resetUserData) before each test — so integration tests exercise
// the same migration/reset path production code does, never a hand-duplicated schema.
export function useIntegrationTestDb(): () => Database.Database {
	let db: Database.Database;
	let dbPath: string;

	beforeAll(() => {
		mkdirSync(scratchDir, { recursive: true });
		dbPath = join(scratchDir, `${randomUUID()}.db`);
		execSync(`"${dbmateBin}" --env INTEGRATION_TEST_DATABASE_URL up`, {
			cwd: hubRoot,
			env: { ...process.env, INTEGRATION_TEST_DATABASE_URL: `sqlite:${dbPath}` }
		});
		db = openDb(`sqlite:${dbPath}`);
		// Scratch db is thrown away after the run, so trade durability for speed: default
		// rollback-journal + synchronous=FULL fsyncs on every write, which is very slow on
		// Windows (FlushFileBuffers latency).
		db.pragma("journal_mode = WAL");
		db.pragma("synchronous = NORMAL");
	});

	beforeEach(() => {
		resetUserData(db);
	});

	afterAll(() => {
		db.close();
		rmSync(dbPath, { force: true });
	});

	return () => db;
}
