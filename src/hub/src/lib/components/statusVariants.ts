// the state machine's vocabulary — mirrors the status-* tokens in
// $lib/styles/variables.scss, so every status-driven surface (strip cell,
// transcript badge) can only ever express one of these.
export type StatusVariant =
	| "pending"
	| "running"
	| "intervention"
	| "interactive"
	| "success"
	| "failed"
	| "error"
	| "stale"
	| "cancelled";
