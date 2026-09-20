// Integration tests run without the SvelteKit Vite plugin (vite.integration.config.ts), so the
// `$env/dynamic/private` virtual module it normally provides doesn't exist — this aliases it to
// the real process.env, which is what that virtual module reads from at runtime anyway.
export const env = process.env;
