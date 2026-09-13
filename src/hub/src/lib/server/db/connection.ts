import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SQLITE_URL_PREFIX = "sqlite:";

export function requireDatabaseUrl(databaseUrl: string | undefined): string {
	if (!databaseUrl) {
		throw new Error(
			"HUB_DATABASE_URL is not set. Copy src/hub/.env.example to src/hub/.env and set it before starting hub."
		);
	}
	return databaseUrl;
}

export function resolveDatabasePath(databaseUrl: string): string {
	if (!databaseUrl.startsWith(SQLITE_URL_PREFIX)) {
		throw new Error(`HUB_DATABASE_URL must start with "${SQLITE_URL_PREFIX}", got "${databaseUrl}"`);
	}
	return databaseUrl.slice(SQLITE_URL_PREFIX.length);
}

export function openDb(databaseUrl: string): Database.Database {
	const path = resolveDatabasePath(databaseUrl);
	mkdirSync(dirname(path), { recursive: true });
	return new Database(path);
}
