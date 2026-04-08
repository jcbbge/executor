# ~~Bug~~ Non-Issue: SurrealDB HTTP API Returns Null

**STATUS: RESOLVED — not a bug**

## What Happened

An agent tested SurrealDB connectivity using raw HTTP curl with the wrong headers and concluded the database was broken. It was not broken.

## Actual Cause

SurrealDB 3.x removed `/v1/query` (404) and changed header names. Without namespace context in the request, HTTP queries silently return `NamespaceEmpty` or null depending on how the caller parses the response.

The control-plane (executor) uses **WebSocket via the surrealdb JS SDK**, not HTTP. It was unaffected. DB had 224+ executions at time of investigation, all inserting correctly.

## Resolution

See **`docs/surrealdb-usage.md`** — the canonical reference for all SurrealDB interaction patterns in this project. Follow it. Do not invent alternatives.
