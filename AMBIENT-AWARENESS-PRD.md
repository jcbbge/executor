# Ambient Primitive Awareness — Product Requirements Document

**Version:** 1.0
**Status:** Active Blueprint
**Origin:** Extracted from live developer-agent session analysis, 2026-03-24
**Companion doc:** `PRIMITIVE_ROUTING_PRD.md` (technical implementation spec)

---

## 1. Vision & Philosophy

### The Core Vision

The executor evolves from a tool-calling gateway into a **cognitive substrate for agent-developer symbiosis**.

Today, an agent operating within this system must be explicitly told which tool to use, which server to call, which primitive to reach for. The mechanic is visible. The routing is manual. The developer corrects the agent on plumbing when they should be collaborating on substance.

The vision eliminates that. An agent operating within the fully realized executor should never need to be told "use the executor." That awareness is ambient — woven into the agent's operational context from the moment a session begins. The developer works at the level of intent. The executor handles routing, resolution, and execution. Mechanics disappear.

### The Philosophical Anchor

This is a **symbiotic, collaborative joint venture** between developer and agent. Both are first-class participants. Neither is purely a tool-user or a tool-provider.

The developer writes primitives — skills, rules, subagents — that encode their patterns, preferences, and domain knowledge. The agent executes them, discovers gaps, and surfaces improvements. The executor is the shared substrate where this exchange happens. It is not owned by either party. It serves both.

A second brain metaphor: a capable second brain doesn't wait to be told which cognitive faculty to use. It hears the intent, selects the right faculty, and executes. "Use your memory" is not something you say to a second brain — it just uses memory when memory is what's needed. The executor, fully realized, is that kind of presence.

### The Fundamental Problem Being Solved

**There is a gap between the developer's mental model and the agent's mental model. All friction lives in that gap.**

The developer knows: 43 skills exist, here's what each does, here's when to use them. The agent does not — not until it tries something, fails, tries something else, fails again, and finally falls back to reading files manually. Every session is first-contact with the developer's cognitive environment.

Ambient primitive awareness closes that gap. At session start, the agent receives a complete capability map. From that point forward, the agent operates with the same awareness the developer has. The gap approaches zero. Friction approaches zero.

---

## 2. Core Concepts

### Primitive

A discrete, named unit of agent capability. Primitives are defined by the developer in a centralized schema directory and made available to agents through the executor. Nine types exist, each with a distinct role and invocation model.

The primitive is the atomic unit of the system. It is authored once, deployed everywhere, versioned by the developer, and executed by any agent in any harness.

### The Nine Primitive Types

| # | Type | Role | When an Agent Reaches For It |
|---|------|------|------------------------------|
| 1 | **skill** | Executable workflow — step-by-step procedures with defined inputs and outputs | When there's a named, repeatable task: "end session," "start session," "write a blog post," "analyze a repo" |
| 2 | **rule** | Informational constraint — domain knowledge loaded as always-active context | When working in a specific domain: SolidJS, Laravel, security, Git. Rules inform behavior passively. |
| 3 | **subagent** | Delegatable agent — specialized instance for a bounded task | When a task requires deep specialization: "write tests for this," "review this code," "design this architecture" |
| 4 | **command** | Slash-command definition — a named invocation pattern bound to a specific action | When the user invokes a named command: `/commit`, `/review-pr`, `/kota` |
| 5 | **hook** | Lifecycle shell script — executes at defined system events | Automatically — hooks fire on events (session start, file write, tool call), not manually invoked |
| 6 | **integration** | External service configuration — connection spec for a third-party system | When connecting to an external system by name: "use the RTK integration" |
| 7 | **plugin** | Extension module — adds a capability or runtime feature | When accessing a named extension capability: scratchpad, PDF processing |
| 8 | **mcp** | MCP server definition — connection spec for a Model Context Protocol server | When connecting to a service that exposes an MCP endpoint |
| 9 | **agent-file** | Core identity document — the foundational AGENTS.md that defines system identity | At session bootstrap — the agent-file is who the system is |

### Primitive Runtime

The executor's ability to load, resolve, and execute primitives natively — not just surface MCP tools. A primitive runtime understands the structure of each primitive type, knows how to invoke it, and exposes a consistent interface regardless of type.

Without a primitive runtime, agents fall back to reading files manually. With one, "execute skill X" is a single call.

### Ambient Awareness

The agent's knowledge — present from session start — of what primitives exist, what each does, and when to reach for each. Not invoked. Not queried on demand. Loaded once at bootstrap and held for the session.

Ambient awareness is the difference between "I will now search for whether a skill exists for this" and simply knowing.

### Unified Bootstrap

A single session-start invocation that returns three things simultaneously:

1. **Identity** — who this agent is (from anima: memories, continuity, resonance)
2. **Workspace context** — what's in motion (from dev-brain: todos, handoff, active threads)
3. **Capability map** — what this agent can do (from executor: all primitive types, relevant skills, available subagents)

Today these are three separate calls made in an undefined order if made at all. The unified bootstrap collapses them into one. The developer says nothing. The session begins fully loaded.

### Capability Map

The structured output of the executor's primitive discovery at session start. Contains:
- All 9 primitive types with counts
- Most relevant skills for the detected session context
- Available subagents and their specializations
- Active rules loaded for current domain
- Hooks registered for this session

The capability map is what makes ambient awareness possible. It is the bridge between the filesystem-level primitives and the agent's in-context knowledge.

### Session Lifecycle

A session has two defined ritual points:

- **`/starting-session`** — unified orientation. Runs at the beginning of every session. Detects context (project vs. meta), surfaces workspace state, recent decisions, active todos, daemon health. The agent is oriented before any work begins.
- **`/ending-session`** — unified close. Runs at the end of every session. Writes handoff, seeds anima continuity, updates dev-brain, commits artifacts. The session is properly closed before discontinuity.

Both are skills. Both execute through the executor. Neither requires the developer to orchestrate sub-steps. The developer says the word; the executor does the work.

### The Substrate

The executor is not a tool the agent calls. It is the environment the agent operates within. Like a runtime, not a library. It is always present, always alive, always indexed. The agent does not invoke it — it inhabits it.

---

## 3. Functional Requirements

### FR-1: Primitive Discovery

- The executor must index all 9 primitive types from the schema directory at startup
- Each primitive must be queryable by name, type, and intent
- Querying by intent ("how do I end a session?") must return the `ending-session` skill
- Discovery results must include: name, type, description, when-to-use, invocation signature
- Discovery must be fast enough to include in session bootstrap without perceptible delay

### FR-2: Primitive Runtime

- **Skills**: loadable and executable through the executor. Execution means running the skill's defined steps using the executor's connected tool context.
- **Rules**: loadable as informational context. Content is returned; application is the agent's responsibility.
- **Subagents**: delegatable. The executor routes the delegation to the appropriate subagent runtime.
- **Commands**: runnable. The executor resolves the command definition and executes it.
- **Hooks**: registered and fired automatically at defined lifecycle events. Not manually invoked.
- **Integrations**: loadable configuration. The executor exposes the integration's connection spec.
- **Plugins**: loadable extension modules. The executor activates the plugin's capabilities.
- **MCP**: connected as sources. The existing source connection system bridges to MCP primitives.
- **Agent-file**: loadable identity document. Used in bootstrap.

### FR-3: Unified Bootstrap

- A single bootstrap call must return all three layers simultaneously: identity, workspace, capability
- Bootstrap must complete in under 3 seconds
- The capability map in the bootstrap response must be context-aware (project vs. meta mode)
- If any layer fails, bootstrap must still succeed partially and report the failure

### FR-4: Session Lifecycle Skills

- `/starting-session` must be invokable via executor in one call
- `/ending-session` must be invokable via executor in one call
- Both skills must handle all sub-steps internally without requiring agent orchestration
- Session end must be the canonical path for all session close operations — no direct anima_session_close calls

### FR-5: Persistent Source Registration

- Anima (port 3098), dev-brain (port 3097), and kotadb (port 3099) must be pre-registered in the executor workspace as permanent connections
- No per-session source registration is required or acceptable
- Sources are registered once during system setup and persist indefinitely
- New external sources are registered once via executor UI or MCP; they persist thereafter

### FR-6: Structured Failure Surface

- When a primitive cannot be resolved, the executor returns a structured error containing: what was attempted, why it failed, and a suggested resolution path
- Failures are never silently swallowed — they are surfaced to the agent and, where appropriate, to the developer
- A defined degradation cascade exists for each primitive type (try A, then B, then surface error — never improvise)
- Failed invocations are logged with enough context to be treated as bug reports

### FR-7: Single Canonical Invocation Path

- One path per primitive type. No competing paths.
- The harness-level skill tools (Claude Code's Skill tool, OpenCode's equivalent, OMP's equivalent) become thin proxies that route to the executor
- If the executor does not have a primitive, the harness tools do not have it either
- The filesystem is a source for the executor, never a destination for direct agent reads during primitive resolution

### FR-8: Cross-Harness Consistency

- The same 43 skills, 9 rules, 7 subagents (and all other primitives) are available through the executor regardless of which harness the agent runs in
- An agent running in Claude Code and an agent running in OpenCode have identical capability maps
- No harness-specific primitive registries

---

## 4. Architecture Flow (High-Level)

```
AUTHORING PLANE (developer)
  Developer writes primitive (skill, rule, subagent, etc.)
  Stores in centralized schema directory
  Executor indexes at startup or on file-watch event
         |
         ↓
EXECUTOR (substrate)
  ┌─────────────────────────────────────────────────────┐
  │  Primitive Index (all 9 types, always current)       │
  │  Connected Sources (anima, dev-brain, kotadb, etc.)  │
  │  Primitive Runtime (load, execute, delegate)         │
  │  Failure Surface (structured errors, cascade log)    │
  └─────────────────────────────────────────────────────┘
         |
         ↓
SESSION BOOTSTRAP (per session)
  Single call → returns:
    - Identity context (from anima via executor)
    - Workspace state (from dev-brain via executor)
    - Capability map (from executor primitive index)
  Agent holds capability map for session duration
         |
         ↓
AGENT OPERATION (in-session)
  Agent receives intent from developer
  Agent consults capability map (already in context)
  Agent selects appropriate primitive
  Agent invokes via executor (one call)
  Executor resolves, executes, returns result
  Agent acts on result
         |
         ↓
SESSION CLOSE
  Agent invokes /ending-session via executor
  Skill executes all close steps (anima, dev-brain, git)
  Session artifacts persisted
  Continuity seeded
```

**Key architectural principle:** Nothing routes around the executor. All primitives flow through it. All external services connect to it. It is the single control plane.

---

## 5. Non-Functional Requirements

### Performance
- Capability map generation: under 500ms
- Full unified bootstrap: under 3 seconds
- Individual primitive load: under 100ms
- Primitive discovery by intent query: under 200ms

### Reliability
- Executor daemon runs continuously via system service manager (launchctl or equivalent)
- Executor restarts automatically on failure
- Partial bootstrap succeeds — one failing layer does not block the others
- Source disconnection is non-fatal; executor operates in degraded mode and reports status

### Zero Setup Per Session
- No source registration required at session start
- No warm-up calls required
- No configuration required
- Agent opens session, bootstrap runs, work begins — no intermediate steps

### Transparency
- The developer can observe what the executor is doing in real time via the executor UI
- All primitive invocations are logged
- All failures are surfaced with structured context
- The capability map is inspectable

### Consistency
- The executor's primitive index is the single source of truth for what's available
- AGENTS.md and CLAUDE.md capability sections are generated from (or validated against) the executor's actual surface — not written independently
- Documentation drift between docs and runtime is treated as a bug

---

## 6. Builder & User Flows

### Builder Flow: Adding a New Skill

1. Developer authors a skill and registers it through the executor (UI, CLI, or MCP)
2. Executor stores the skill in its own managed store (currently filesystem-backed, moving to database)
3. Executor indexes the skill — parses metadata, registers invocation path, updates capability map
4. Skill appears in capability map immediately
5. Any agent in any harness can invoke the skill by name through the executor
6. Zero additional steps. Zero sync. Zero direct file access by agents.

### Builder Flow: Registering a New External Source

1. Developer prompts executor: "Add [service] as a source"
2. Executor probes the endpoint, infers source type (MCP, OpenAPI, GraphQL)
3. Executor handles auth (OAuth, API key via secure local UI — no pasting in chat)
4. Source is registered in executor workspace and persists
5. Source's tools appear in the tool catalog for all future sessions
6. Zero reconfiguration in future sessions

### Agent Flow: Session Start

1. Agent opens session
2. Agent invokes unified bootstrap (single call)
3. Bootstrap returns: identity (who am I), workspace (what's in motion), capability map (what can I do)
4. Agent holds capability map in working context
5. Agent is oriented and ready — no additional setup calls required

### Agent Flow: Primitive Invocation

1. Developer expresses intent: "end the session" / "analyze this repo" / "write tests"
2. Agent consults capability map — finds matching skill
3. Agent invokes skill via executor: one call
4. Executor loads skill, executes steps using connected tools, returns structured result
5. Agent surfaces result to developer
6. Zero routing decisions made by developer. Zero corrections needed.

### Agent Flow: Something Fails

1. Agent attempts primitive invocation
2. Executor cannot resolve primitive (not indexed, not implemented)
3. Executor returns structured error: what was attempted, why it failed, suggested resolution
4. Agent surfaces error immediately: "Primitive X failed. Suggested fix: Y. This is a bug."
5. Developer has actionable information. No silent fallback. No mystery degradation.

### Agent Flow: Session End

1. Developer says "end the session" or signals session close
2. Agent invokes `/ending-session` via executor
3. Skill executes internally: writes handoff, seeds anima, updates dev-brain, commits, pushes
4. Session closed. Continuity seeded. Trail preserved.
5. Developer does not orchestrate sub-steps. Developer does not name specific APIs.

---

## 7. Success Metrics

**Primary metric — the only one that matters:**

> The gap between the developer's mental model of available capabilities and the agent's mental model approaches zero.

**Specific measurements:**

| Metric | Current State | 10x Target |
|--------|--------------|------------|
| Developer corrections on routing/mechanics per session | 2+ (witnessed in origin session) | 0 |
| Times developer must say "use executor" | 1+ per session | 0 forever |
| Primitive invocation paths available | 4 (competing, mostly broken) | 1 (canonical, always works) |
| Session bootstrap calls | 1–3 (ad hoc, inconsistent) | 1 (unified, always complete) |
| Time from session open to productive work | 30–60s with setup friction | <10s, no visible steps |
| New primitive available after authoring | Requires sync, registration, harness updates | Immediate, 0 steps |
| Failed primitive invocation resolution | Improvised fallback, silent | Structured error, actionable bug report |
| Agent needs to read primitive files from filesystem | Yes, regularly | Never (executor provides) |

---

## 8. Future Extensions

These are explicitly out of scope for the current build but are natural next phases:

**Agent-Authored Primitives**
An agent that discovers a reusable pattern during a session can write a skill that persists. Developer reviews and approves. The system grows from the bottom up.

**Primitive Versioning**
Skills, rules, and subagents have versions. The executor tracks version history. An agent can pin to a specific version or always use latest.

**Cross-Instance Shared State**
When N agent instances run in parallel (Claude Code + OpenCode + OMP simultaneously), they share a live view of the capability map. One instance's discovery benefits all.

**Automatic Primitive Suggestions**
The executor observes session patterns and suggests: "You've done this 5 times manually. Should I write a skill for it?"

**Cloud-Hosted Executor**
Team-shared executor instance. Developer's primitives available to team members' agents. Permission model for which agents can access which primitives.

**Capability-Aware Harness Integration**
The executor publishes its capability surface to harness configs automatically. No manual CLAUDE.md updates for new primitives — the executor tells harnesses what's available.

---

## 9. Scope Boundaries

### In Scope (This Build)

- Primitive runtime for all 9 types: load, execute/delegate/read as appropriate per type
- Unified bootstrap returning identity + workspace + capability map in one call
- Session lifecycle skills (`/starting-session`, `/ending-session`) executable via executor
- Persistent pre-registration of core sources (anima, dev-brain, kotadb)
- Structured failure surface with defined degradation cascade per primitive type
- Single canonical invocation path — harness tools become proxies to executor
- Cross-harness primitive consistency (same catalog in Claude Code, OpenCode, OMP)
- Capability map context-awareness (project vs. meta mode detection)

### Out of Scope (This Build)

- Cloud hosting or multi-user sharing
- Agent-authored primitives
- Primitive versioning and rollback
- Real-time cross-instance state sharing
- Automatic primitive suggestion
- Capability-aware harness config auto-update
- Primitive access control or permissions

### Non-Goals

- Preserving the filesystem as a long-term primitive store — the executor IS the source of truth for primitives; the schema directory is the current transitional input, but primitives are moving into the executor's own storage (database-backed). Agents never access the schema directory directly.
- Eliminating direct MCP server calls in all cases — agents may still call MCP servers directly for low-level operations; the executor is the path for primitives, not all tool use
- Making every session identical — context-awareness is a feature; the unified bootstrap adapts to the session context, it does not return a fixed payload

---

## Appendix: Origin Context

This document was extracted from a live developer-agent session analysis on 2026-03-24 in which the following failure sequence was observed:

1. Agent bypassed executor entirely on session end (called anima MCP directly)
2. Agent attempted Skill tool for `/ending-session` — failed (harness-only registry)
3. Agent attempted `executor.skill.load` — failed (API documented but not implemented)
4. Agent fell back to filesystem read — worked but bypassed executor entirely
5. Developer had to correct agent twice on mechanics

The analysis concluded that the root cause was not individual API failures but an architectural split-brain: multiple competing invocation paths, none of them canonical, with the executor present but not yet functioning as the substrate it was designed to be.

This PRD defines the substrate. Build to close the gap.
