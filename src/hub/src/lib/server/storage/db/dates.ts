// SQLite has no native timestamp type; columns like last_heartbeat_on store ISO-8601 text.
// Translate at the DB boundary so nothing outside lib/server/db handles a raw date string.
export function toDbDate(date: Date): string;
export function toDbDate(date: Date | null): string | null;
export function toDbDate(date: Date | null): string | null {
	return date === null ? null : date.toISOString();
}

export function fromDbDate(value: string): Date;
export function fromDbDate(value: string | null): Date | null;
export function fromDbDate(value: string | null): Date | null {
	return value === null ? null : new Date(value);
}
