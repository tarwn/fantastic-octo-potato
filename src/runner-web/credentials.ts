import { requireEnv } from "./config.ts";

const CREDENTIAL_ENV_PREFIX = "RUNNER_CREDENTIAL_";

// A Recipe's `{ref:"credential", name:"username"}` resolves only on the Runner, never sent by
// Hub, via `RUNNER_CREDENTIAL_<NAME>` env vars — following config.ts's requireEnv "let it crash"
// pattern: a missing credential is a Runner configuration bug, not a Job-level failure.
export function resolveCredential(name: string): string {
	return requireEnv(`${CREDENTIAL_ENV_PREFIX}${name.toUpperCase()}`);
}

// A Training Run has no upfront Recipe to scan for `{ref:"credential"}` names the way
// collectCredentialNames (orchestrator/program/credentialNames.ts) does for a Recipe Job — this is
// the Runner's only chance to tell Hub what credential names it has available, so the next-Step
// prompt can reference them (jobs/types.ts's `credentialNames` on a dslStep report).
export function listAvailableCredentialNames(): string[] {
	return Object.keys(process.env)
		.filter((key) => key.startsWith(CREDENTIAL_ENV_PREFIX) && key.length > CREDENTIAL_ENV_PREFIX.length)
		.map((key) => key.slice(CREDENTIAL_ENV_PREFIX.length).toLowerCase());
}
