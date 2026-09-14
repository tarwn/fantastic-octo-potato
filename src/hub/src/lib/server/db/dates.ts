// SQLite has no native timestamp type; columns like last_heartbeat_on store ISO-8601 text.
// Translate at the DB boundary so nothing outside lib/server/db handles a raw date string.
export function toDbDate(date: Date): string {
	return date.toISOString();
}

export function fromDbDate(value: string): Date {
	return new Date(value);
}
