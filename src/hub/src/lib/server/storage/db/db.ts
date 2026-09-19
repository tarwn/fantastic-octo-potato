import type Database from "better-sqlite3";

import { openDb, requireDatabaseUrl } from "./connection";

import { env } from "$env/dynamic/private";

let db: Database.Database | undefined;

export function getDb(): Database.Database {
	if (!db) {
		db = openDb(requireDatabaseUrl(env.HUB_DATABASE_URL));
	}
	return db;
}
