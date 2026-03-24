# AGENTS.md — Executor

## What This Is

The executor is a local-first execution environment being extended into the **universal primitive gateway** for agent-developer collaboration.

Its current job: give agents a TypeScript runtime and a discoverable, typed tool catalog instead of raw HTTP calls or bloated MCP manifests in context.

Its expanding job: become the single substrate through which all nine agentic primitive types flow — skills, rules, subagents, commands, hooks, integrations, plugins, MCP servers, and agent-files. Every primitive the developer writes, the executor manages, exposes, and executes. Every primitive the agent needs, the executor provides.

This is not a tool you call. It is the environment you operate within.

---

## Architecture at a Glance

```
Developer authors primitives
        ↓
Executor ingests, stores, indexes (moving to database-backed)
        ↓
Agent queries via discover → invokes via typed catalog
        ↓
Executor executes in sandboxed TypeScript runtime
        ↓
Results returned to agent
```

Three access surfaces:
- **CLI** (`apps/executor`) — local developer use
- **Web UI** (`apps/web`) — source management, secret input, execution inspection
- **MCP endpoint** (`/mcp`) — how agents and harnesses connect

---

## The Nine Primitives

The executor is being extended to natively manage and expose all nine primitive types:

| # | Type | Status | Role |
|---|------|--------|------|
| 1 | **skill** | In progress | Executable named workflows |
| 2 | **rule** | In progress | Domain constraints loaded as context |
| 3 | **subagent** | In progress | Specialized delegatable agents |
| 4 | **command** | In progress | Slash-command definitions |
| 5 | **hook** | In progress | Lifecycle shell scripts |
| 6 | **integration** | In progress | External service connection specs |
| 7 | **plugin** | In progress | Extension modules |
| 8 | **mcp** | Exists (source system) | MCP server connections |
| 9 | **agent-file** | In progress | Core identity document |

Primitives are currently sourced from the `_agents` schema directory during migration. The destination is the executor's own database-backed store. **Agents never access the schema directory directly — they always go through the executor.**

See `PRIMITIVE_ROUTING_PRD.md` for the technical implementation spec.
See `AMBIENT-AWARENESS-PRD.md` for the product vision and philosophical foundation.

---

## Core Principles for Agents Working in This Codebase

### The Executor Is the Only Door
All primitive access flows through the executor. No agent should read primitive files from the filesystem directly. No harness-specific primitive registries. One door.

### Failure Is Loud, Not Silent
When the executor cannot resolve a primitive, it returns a structured error — not a fallback, not silence. Agents surface this as a bug. The degradation cascade is defined and logged.

### Database-Backed Is the Destination
The filesystem is the current transitional source. All primitive storage is moving to the executor's own database (SQLite local, Postgres cloud). Build toward that, not away from it.

### The Primitive Runtime Is the Critical Gap
The executor currently surfaces MCP tools. It does not yet execute skills, load rules, or delegate to subagents natively. That primitive runtime is what's being built. It is the highest-priority work.

### Unified Bootstrap Is the North Star
The session start experience should be a single call that returns identity (anima), workspace state (dev-brain), and a full capability map (executor). All three layers, one call, under three seconds.

---

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | Product overview and mental model |
| `ARCHITECTURE.md` | Active v3 system architecture |
| `PLAN.md` | Current build goals and context |
| `PRIMITIVE_ROUTING_PRD.md` | Technical spec: extending executor to all 9 primitive types |
| `AMBIENT-AWARENESS-PRD.md` | Product vision: ambient awareness, unified bootstrap, symbiosis |
| `personal-notes.md` | Josh's current thinking on credential system and architecture |

---

## Current Stack

- **Runtime:** TypeScript, Bun
- **Sandbox:** SES (secure eval sandbox)
- **Persistence:** SQLite (local), Postgres (cloud target)
- **Monorepo:** Turborepo, `apps/` + `packages/`
- **Active version:** v3 (clean rewrite; legacy in `legacy/`, `legacy2/`)

---

## What "Done" Looks Like

An agent opens a session. Bootstrap fires. The agent receives its identity, the workspace state, and a complete map of every primitive available to it — all in one call, under three seconds.

The agent works. It invokes a skill. One call to the executor. The executor loads it, runs it, returns the result. The agent never reads a file. The agent never registers a source. The agent never needs to be told which path to use.

The session ends. The agent invokes `/ending-session`. One call. Everything is persisted.

The developer never corrects the agent on mechanics. Only on substance.

That is done.
