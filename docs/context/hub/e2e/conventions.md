# E2E test conventions

Durable rules for Playwright specs in `e2e/`.

- **One spec file per page by default**, named `<page>.spec.ts` (e.g.
  `home.spec.ts` for `/`) to keep files scoped to what a user sees on
  that route. If it exceeds 400 lines, extract one test-topic's worth of
  `test()` blocks into a neighboring `<page>.{topic}.spec.ts` file
  instead of letting the original file keep growing. Enforced by
    `npm run guard:tools:test-file-size`.
- **`smoke.spec.ts` is reserved for cross-cutting invariants** that apply
  regardless of which page is under test — e.g. "driving a real create
  flow through the UI leaves the real `.data/` folder byte-for-byte
  unchanged"
- **Assert on user-visible behavior**, via role/text queries
  (`getByRole`, `getByText`), not CSS selectors or test IDs — mirrors
  what someone looking at the page would actually observe.
- **One test per user-observable scenario** per file; keep assertions
  for a single scenario in one `test()` block rather than splitting
  trivially-related expectations across multiple tests.
- If a flow spans multiple pages (e.g. a multi-step wizard), prefer a
  `<flow>.spec.ts` named for the flow rather than forcing it into a
  single page's file
