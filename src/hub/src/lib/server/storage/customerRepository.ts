import type Database from "better-sqlite3";

export interface Customer {
	id: number;
	name: string;
}

export function countCustomers(db: Database.Database): number {
	const { count } = db.prepare("SELECT COUNT(*) as count FROM customer").get() as { count: number };
	return count;
}

export function listCustomers(db: Database.Database): Customer[] {
	return db.prepare("SELECT id, name FROM customer ORDER BY name").all() as Customer[];
}

export function getCustomerById(db: Database.Database, id: number): Customer | undefined {
	return db.prepare("SELECT id, name FROM customer WHERE id = ?").get(id) as Customer | undefined;
}

export function insertCustomer(db: Database.Database, name: string): Customer {
	const { lastInsertRowid } = db.prepare("INSERT INTO customer (name) VALUES (?)").run(name);
	return { id: Number(lastInsertRowid), name };
}
