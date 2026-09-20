const OPERATOR_ID_STORAGE_KEY = "hub.operatorId";

let inMemoryOperatorId: string | undefined;

// An ownership token that keeps two browser tabs from sending mixed signals, not an identity.
// Browser storage can be blocked or empty, so a session-scoped id is the fallback rather than a crash.
export function getOperatorId(): string {
	try {
		const stored = localStorage.getItem(OPERATOR_ID_STORAGE_KEY);
		if (stored) {
			return stored;
		}
		const created = crypto.randomUUID();
		localStorage.setItem(OPERATOR_ID_STORAGE_KEY, created);
		return created;
	}
	catch {
		inMemoryOperatorId ??= crypto.randomUUID();
		return inMemoryOperatorId;
	}
}
