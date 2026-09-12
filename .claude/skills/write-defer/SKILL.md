---
name: write-defer
description: Writes a new Deferred Decision Record
---

DEFERs are:
- stored in `docs/defers*`
- named 0000-short-decision-description.md, where the 0000 is an incrementing number within the folder
- listed in `docs/defers/_index.md` with a link, name as summary, author, and status

A DEFER document is an explicitly deferred decision (cut scope or feature). It records a succinct summary of what the feature or consideration was and why it was deferred.

## Process

To write a new DEFER:
- get the max number prefix for DEFERs in the folder and increment by 1
- summarize the content into a short title, lowercase, kebab style
- use this [template](./docs/defers/_template.md)
- write the new ADR file
- append a new row to `docs/defers/_index.md` for this ADR
