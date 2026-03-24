# Session Handoff
Date: 2026-03-24
Branch: main

## Completed This Session

### SurrealDB Persistence Layer — Full Port
- **`useTx` redesigned**: Callback API → `TxStatement[]` array API. All statements bundled into a single `db.query()` call with `BEGIN TRANSACTION; ...; COMMIT TRANSACTION;` to work within SurrealDB v2 WebSocket RPC (separate calls don't share transaction state).
- **Variable renaming**: Per-statement vars renamed `$content` → `$__tx_0_content` to prevent collision in bundled queries. Regex `\\$${key}(?![a-zA-Z0-9_])` handles field access like `$content.id` correctly.
- **`RETURN BEFORE *` → `RETURN BEFORE`**: Fixed across all 11 surreal-repos (SurrealDB v2 syntax).
- **Cascade deletes** (`removeTreeById`, `removeById`, `replaceForSource`, `removeByWorkspaceAndSourceId`) switched from `useTx` to `use()` — intermediate SELECTs can't be deferred. Only `insertWithOwnerMembership` (no intermediate reads, requires atomicity) stays transactional.

### FR-3: Unified Bootstrap
- **`executor.primitives.bootstrap`** tool added to `executor-tools.ts`. Single call returns:
  - `identity` — anima_bootstrap result from port 3098
  - `workspace` — get_recent_context from dev-brain on port 3097
  - `capabilities` — discover() from executor's primitives service (total + byType counts)
  - All three fetched in parallel with `Promise.allSettled` — each degrades gracefully on failure.

### FR-5: Persistent Source Registration
- anima (3098), dev-brain (3097), kotadb (3099) all successfully registered as persistent MCP sources via executor's sources API. Source records survive executor restarts in SurrealDB.
- kotadb endpoint fix: `http://127.0.0.1:3099/` (root, not `/mcp`).
- kotadb schema fix: `search_dependencies`, `find_usages`, `analyze_change_impact` tools had properties at top level of `inputSchema` instead of wrapped in `{ type: "object", properties: {...} }`. Fixed in `/Users/jcbbge/kotadb/app/src/mcp/tools.ts` on `develop` branch (commit `84ce97c`).

### Executor Tested End-to-End
- `executor.tools.list` — lists all registered tools across all sources
- `executor.sources.list` — anima, dev-brain, kotadb all live
- `executor.primitives.discover` — 33 primitives across skill/rule/command/subagent types
- `executor.primitives.bootstrap` — all three layers returning successfully

## Current State
- All 100 control-plane tests passing
- executor daemon at `http://127.0.0.1:8000` with anima, dev-brain, kotadb sources registered
- `executor.primitives.bootstrap` is the new session bootstrap primitive
- Commits: `027e2ee2` (this session), `99e37656` (previous session)

## Next Steps
1. **kotadb develop → main merge** — schema fix committed to `develop` branch, needs PR/merge
2. **Update CLAUDE.md** — replace two-step "anima_bootstrap + /starting-session" with `executor.primitives.bootstrap()` as the single session bootstrap call
3. **mcp primitive type gap** — executor's mcp primitive type returns 0; doesn't bridge to filesystem MCP definitions in `~/Documents/_agents/schema/mcp/`
4. **FR-7: Single canonical invocation path** — harness Skill tool becomes proxy to `executor.skill.execute`

## Known Gaps vs PRD
- `executor.rule.read` — present but rules returned as raw text, not applied as context (FR-4 partial)
- mcp primitive type — not bridged to filesystem definitions (minor)
- FR-7 harness proxy — skill tool still routes directly to subagent-mcp, not through executor
