import { requireEnv } from "./config.ts";

// A Recipe's `{ref:"credential", name:"username"}` resolves only on the Runner, never sent by
// Hub, via `RUNNER_CREDENTIAL_<NAME>` env vars — following config.ts's requireEnv "let it crash"
// pattern: a missing credential is a Runner configuration bug, not a Job-level failure.
export function resolveCredential(name: string): string {
	return requireEnv(`RUNNER_CREDENTIAL_${name.toUpperCase()}`);
}
