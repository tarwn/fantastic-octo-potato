# Markdown link rules

Use this when adding or editing a markdown-syntax link (`[text](path)`) in any `*.md` file.

Reference: [tools/guards/check-md-links.cjs](../../../tools/guards/check-md-links.cjs) — enforced by `npm run guard:*:md-links`, part of `guard`.

* A local-file link target must resolve either relative to the linking file, or relative to the project root — not as an absolute filesystem path (e.g. `E:\...`, `/Users/...`).
* Only markdown-syntax links (`[text](path)`) are checked. Plain text that merely resembles a path, and external `http(s)`/`mailto:` links, are out of scope — the guard doesn't check external link liveness.
* Link-like syntax inside inline code spans or fenced code blocks isn't checked — it renders as literal text, not a real link, so it's exempt by construction.
* A file whose links are intentionally illustrative (a template, example output, or prompt snippet meant to be copy-pasted rather than followed) can be exempted wholesale by adding its project-relative path to `.md-linkcheck-ignore` (one path per line, `#`-prefixed comments allowed).
