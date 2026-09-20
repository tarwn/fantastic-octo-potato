# ADR 4: Plain `fetch` LLM client, no SDK dependency

**Author:** Agent (Eli Weinstock-Herman)

Spec [0009-training-run](../../specs/0009-training-run/spec.md) adds Hub's first LLM integration: an OpenAI-scheme chat-completions call, used by three callers (goal → Ingredients, next-Step generation, Recipe compilation). Constraint C001 requires an ADR before adding an LLM SDK dependency, or a documented "no new dependency" decision otherwise.

## Decision

We will not add an LLM SDK dependency. Hub's LLM client (`src/hub/src/lib/server/llm/llmClient.ts`) sends chat-completion requests with a plain `fetch` call against an OpenAI-scheme endpoint, configured entirely from `.env` (`LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`, documented in `src/hub/.env.example`), and returns the raw text response.

## Rationale

All three callers need the same narrow shape: send a system + user message, get back one text response to validate/retry against. None need streaming, tool-calling, multi-provider abstraction, or SDK-managed retries — the retry/validation logic is call-specific (DSL Step grammar, Ingredient shape, Recipe shape) and lives in each caller, not in the client. An SDK would add a dependency surface (transport, auth, provider-specific types) that nothing in this spec uses, contrary to the codebase's "smallest change"/YAGNI bias. A plain `fetch` call against a single well-documented HTTP contract (OpenAI-compatible chat completions) is small enough to own directly and keeps Hub decoupled from any one provider's client library.

### Considered Options

* Plain `fetch` client (chosen) — no new dependency, one function, matches the narrow OpenAI-scheme HTTP contract this spec needs.
* Official `openai` SDK — adds a dependency for streaming/tool-calling/multi-provider surface this spec doesn't use; couples Hub to that package's request/response types instead of the plain OpenAI-scheme wire format.
* A generic multi-provider LLM abstraction library (e.g. LangChain-style) — far more surface than three call sites need; adds an unfamiliar abstraction layer for a single OpenAI-scheme endpoint.

## Status

Accepted

## Consequences

* Hub owns the request/response typing for the OpenAI-scheme chat-completions contract directly; a provider change that breaks wire compatibility with that scheme would require updating `llmClient.ts` by hand rather than a dependency bump.
* No SDK-level retry/streaming is available; each caller (Ingredients, next-Step, compilation) implements its own bounded correction retry on top of the raw text response, per R003/R006.
* Adding a second, wire-incompatible LLM provider later would mean extending or forking `llmClient.ts` rather than swapping an SDK configuration — acceptable at today's single-provider scope, revisit if that changes.
