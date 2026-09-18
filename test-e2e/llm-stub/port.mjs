// Single source of truth for the LLM stub's default port — imported by server.mjs, run.mjs,
// client.ts, and playwright.config.ts so the port only needs to change in one place.
export const DEFAULT_LLM_STUB_PORT = 4175;
