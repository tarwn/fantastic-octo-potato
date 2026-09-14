import type Database from "better-sqlite3";

export interface Application {
	id: number;
	name: string;
}

export function countApplications(db: Database.Database): number {
	const { count } = db.prepare("SELECT COUNT(*) as count FROM application").get() as { count: number };
	return count;
}

export function insertApplication(db: Database.Database, name: string): Application {
	const { lastInsertRowid } = db.prepare("INSERT INTO application (name) VALUES (?)").run(name);
	return { id: Number(lastInsertRowid), name };
}
