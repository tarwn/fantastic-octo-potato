---
name: write-adr
description: Writes a new Architecture Decision Record
---

ADRs are:
- stored in `docs/adrs/{area}/*`
- named 0000-short-decision-description.md, where the 0000 is an incrementing number within the folder
- listed in `docs/adrs/{area}/_index.md` with a link, name as summary, author, and status

ADR Author:
- for human-driven decisions, list their name 
- for agent-driven decisions, list the name of the agent and the human driving

ADR Area:
- provided as an input, one of "general", "hub", "runner-web", "tools"
- raise an error for human escalation if the area has not been provided or does not match these values

## Process

To write a new ADR:
- get the max number prefix for ADRs in the folder and increment by 1
- summarize the content into a short title, lowercase, kebab style
- use this [template](./docs/adrs/_template.md)
- write the new ADR file
- append a new row to `docs/adrs/{area}/_index.md` for this ADR

If the decision was dictated by the user (direct chat, todo file), use information they provided or require them to provide an explanation to use. "It was in the todo file" is not rationale.
