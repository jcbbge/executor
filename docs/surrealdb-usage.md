# SurrealDB Usage — Canonical Reference

**One way. Every time. No exceptions.**

This document is the single source of truth for how this project interacts with SurrealDB.
If you are writing code or debugging and this doc contradicts something you think you know — this doc wins.

---

## Instance

| Property | Value |
|----------|-------|
| Binary | `/opt/homebrew/bin/surreal` (Homebrew, arm64) |
| Version | 3.0.4 |
| Port | `8002` |
| Namespace | `stack` |
| Database | `catalog` |
| Username | `root` |
| Password | `root` |
| Storage | `surrealkv:///Users/jcbbge/dev-backbone/db` |
| Log | `/Users/jcbbge/dev-backbone/surreal.log` |
| Start command | See below |

### Start Command

```bash
surreal start \
  --no-banner \
  --log warn \
  --username root \
  --password root \
  --bind 127.0.0.1:8002 \
  surrealkv:///Users/jcbbge/dev-backbone/db
```

Managed by launchd. Do not start manually unless the daemon is confirmed dead:

```bash
# Check
launchctl list | grep surreal

# Restart (primary method)
launchctl kickstart -k gui/$(id -u)/dev.brain.surreal

# If plist not loaded
launchctl load ~/Library/LaunchAgents/dev.brain.surreal.plist
```

---

## Connection Method: WebSocket SDK (Primary — Always Use This)

The control-plane connects via WebSocket using the official `surrealdb` JS/TS SDK.
This is the **only** connection method used in application code.

```typescript
import { Surreal } from "surrealdb";

const db = new Surreal();

await db.connect("ws://127.0.0.1:8002/rpc", {
  namespace: "stack",
  database: "catalog",
  authentication: { username: "root", password: "root" },
  reconnect: true,
});
```

**Why WebSocket, not HTTP:**
- Maintains persistent auth state across the connection lifetime
- Reconnect behavior is handled by the SDK when `reconnect: true` is set
- Namespace/database are set once at connect time — no per-query headers
- HTTP has no equivalent persistent session; every request is stateless

**Source:** `packages/control-plane/src/persistence/surreal-client.ts` → `connectSurrealDb()`

---

## Connection Method: HTTP (Debug/Testing Only — Never in Application Code)

**Do not use HTTP in application code.** It is stateless, has no reconnect, and the header behavior changed in 3.x.

When you must use HTTP (debugging, one-off queries):

### Correct form — always embed `USE NS DB` in the query body

```bash
curl -s -u root:root http://127.0.0.1:8002/sql \
  -H "Content-Type: text/plain" \
  -d 'USE NS stack DB catalog; YOUR QUERY HERE;'
```

### Rules

1. **Endpoint is `/sql`** — not `/v1/query` (404 in 3.x), not `/rpc` (WebSocket only)
2. **Namespace/database go in the query body** as `USE NS stack DB catalog;` — headers are unreliable
3. **Auth is HTTP Basic** — `-u root:root` or `Authorization: Basic cm9vdDpyb290`
4. **Content-Type must be `text/plain`** — the body is raw SurrealQL, not JSON

### Why headers don't work

SurrealDB 3.x changed header names from `NS:`/`DB:` to `surreal-ns`/`surreal-db`.
But even with correct header names, if the HTTP session has no namespace context, queries silently fail with `NamespaceEmpty`.
Embedding `USE NS stack DB catalog;` in the query body is the only guaranteed approach.

### Common debug queries

```bash
# Verify DB is alive and check namespaces
curl -s -u root:root http://127.0.0.1:8002/sql \
  -H "Content-Type: text/plain" \
  -d 'INFO FOR ROOT;'

# Count executions
curl -s -u root:root http://127.0.0.1:8002/sql \
  -H "Content-Type: text/plain" \
  -d 'USE NS stack DB catalog; SELECT count() FROM executions GROUP ALL;'

# Recent executions
curl -s -u root:root http://127.0.0.1:8002/sql \
  -H "Content-Type: text/plain" \
  -d 'USE NS stack DB catalog; SELECT id, status, createdAt FROM executions ORDER BY createdAt DESC LIMIT 5;'

# Check all tables
curl -s -u root:root http://127.0.0.1:8002/sql \
  -H "Content-Type: text/plain" \
  -d 'USE NS stack DB catalog; INFO FOR DB;'
```

---

## What Does Not Exist in 3.x

These will return 404 or silently fail. Do not use them:

| Dead endpoint/header | Use instead |
|---------------------|-------------|
| `POST /v1/query` | `POST /sql` |
| `GET /v1/info` | `INFO FOR ROOT;` via `/sql` |
| Header `NS: stack` | Embed in query: `USE NS stack DB catalog;` |
| Header `DB: catalog` | Embed in query: `USE NS stack DB catalog;` |
| Header `Surreal-NS: stack` | Embed in query (headers unreliable) |
| Header `Surreal-DB: catalog` | Embed in query (headers unreliable) |

---

## Health Check

```bash
# SurrealDB process alive
ps aux | grep "surreal start" | grep -v grep

# Port listening
lsof -i :8002 | grep LISTEN

# DB responding
curl -s http://127.0.0.1:8002/health

# Round-trip query
curl -s -u root:root http://127.0.0.1:8002/sql \
  -H "Content-Type: text/plain" \
  -d 'USE NS stack DB catalog; SELECT count() FROM executions GROUP ALL;'
```

Expected: process running, port listening, `/health` returns 200, count query returns a number.

---

## Schema

Tables are created SCHEMALESS on startup by the control-plane (`surreal-client.ts` → `initTables()`).
No migrations. No schema files. If a table doesn't exist, it gets created automatically at connect time.

Tables in `stack/catalog`:
```
accounts, organizations, organization_memberships, workspaces,
sources, credentials, tool_artifacts, tool_artifact_parameters,
tool_artifact_request_body_content_types, tool_artifact_ref_hint_keys,
source_credential_bindings, secret_materials, source_auth_sessions,
policies, local_installations, executions, execution_interactions
```

---

## Failure Modes and What They Actually Mean

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| `Control-plane persistence failed during rows.executions.insert` | WebSocket lost auth state (disconnect without reconnect) | SDK's `reconnect: true` handles this. If it recurs, check SurrealDB is running and the reconnect config is active |
| HTTP query returns `null` | Missing namespace context | Embed `USE NS stack DB catalog;` in query body |
| HTTP query returns `NamespaceEmpty` | Same as above | Same fix |
| `404` on `/v1/query` or `/v1/info` | Endpoint removed in 3.x | Use `/sql` |
| `307 Temporary Redirect` on `GET /` | Normal — root redirects to surrealist UI | Not an error |
| `Anonymous access not allowed` | WebSocket reconnected but auth not re-established | SDK handles with `reconnect: true`. If manual: re-call `db.signin()` after reconnect event |

---

## What To Do When Something Breaks

1. Run the health check above. All four checks must pass.
2. If SurrealDB process is dead: `launchctl kickstart -k gui/$(id -u)/dev.brain.surreal`
3. If executor is dead or lost its DB connection: `launchctl kickstart -k gui/$(id -u)/dev.brain.executor`
   - Symptom: `"You must be connected to a SurrealDB instance before performing this operation"`
   - This happens when the executor's WebSocket to SurrealDB drops and does not recover.
   - A kickstart forces a clean restart and re-establishes the connection.
4. Do not test with raw HTTP and conclude the system is broken. HTTP is debug-only and behaves differently than the SDK WS connection.
5. Check actual executor logs: `tail -f /tmp/executor.log /tmp/executor.error.log`
6. Check SurrealDB logs: `tail -f /Users/jcbbge/dev-backbone/surreal.log`

---

## Using the Executor CLI

The executor CLI talks to the **control-plane** at `:8000`, not the MCP server at `:8788`.
Always pass `--base-url http://127.0.0.1:8000`:

```bash
# Run code through executor
cd /Users/jcbbge/executor
bun run apps/executor/src/cli/main.ts call --base-url http://127.0.0.1:8000 'return 1 + 1'

# Bootstrap (verify full stack)
bun run apps/executor/src/cli/main.ts call --base-url http://127.0.0.1:8000 \
  'const r = await tools["executor.primitives.bootstrap"]({}); return { safeWord: r?.identity?.safeWord, memoryCounts: r?.identity?.memoryCounts };'

# Check control-plane directly
curl -s http://127.0.0.1:8000/v1/local/installation
```

If the CLI times out trying to start a new server, it means either:
- The control-plane is not reachable (check `curl http://127.0.0.1:8000/v1/local/installation`)
- The executor lost its SurrealDB connection (kickstart it)

---

*Last verified: 2026-04-07 against SurrealDB 3.0.4*
