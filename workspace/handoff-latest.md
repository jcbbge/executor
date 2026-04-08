# Session Handoff
Date: 2026-04-08
Branch: main
Mode: project (executor)

## Completed

- **CLI port default fix** — `DEFAULT_CONTROL_PLANE_BASE_URL` (8000) added to config.ts. All CLI commands now work without `--base-url`. Two named constants make MCP port (8788) and control-plane port (8000) unambiguous.
- **SurrealDB canonical docs** — `docs/surrealdb-usage.md`: one connection method, one HTTP debug form, failure mode table, health check, executor CLI usage. `docs/bug-surrealdb-http-returns-null.md` closed and points to it.
- **executor-mcp-bridge.js** — `~/bin/executor-mcp-bridge.js`: stdio↔streamable-http bridge replacing mcp-remote in Claude Code. mcp-remote expects SSE; executor speaks streamable-http — incompatible. Bridge tested and working.
- **claude_desktop_config.json** — executor entry switched from npx mcp-remote to node bridge.
- **pi extension** — `~/.pi/agent/extensions/executor.ts`: registers `execute` and `resume` as native LLM-callable tools.
- **opencode plugin** — `~/.config/opencode/plugins/executor.ts`: same, using Plugin/tool() API. Added to opencode.json.
- **AGENTS.md updated** — HOW section clarifies: call `execute` directly as a tool in pi/opencode. No bash. No curl.

## Decisions

- ADR: Executor CLI defaults to control-plane port (8000), not MCP port (8788)

## Current State

- Committed and pushed to jcbbge/executor main
- bridge, pi extension, opencode plugin are not in git repos (no .git in ~/bin, ~/.pi, ~/.config/opencode)

## Next Steps

1. Verify execute/resume work end-to-end in a real pi session (tool appears in catalog, returns results)
2. Verify same in opencode
3. Claude Code is already confirmed working (reported by Josh)
4. Consider putting ~/bin and ~/.pi/agent/extensions under version control
