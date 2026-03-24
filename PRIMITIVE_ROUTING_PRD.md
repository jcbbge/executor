# Executor Primitive Routing Extension — PRD

## Summary

Extend executor from a **tool gateway** to a **universal primitive gateway** that routes to all 9 agentic core primitive types from `~/Documents/_agents/schema/`.

Current: `executor` = MCP servers + OpenAPI + GraphQL → tools catalog  
Target: `executor` = 9 primitive types with namespaced routing like `executor.skill[skill_name]`

---

## The 9 Primitives

From `~/Documents/_agents/schema/`:

| # | Primitive | Directory | Description | Route Pattern |
|---|-----------|-----------|-------------|---------------|
| 1 | **agent-file** | `agent-file/` | Agent definitions/templates | `executor.agent_file[name]` |
| 2 | **commands** | `commands/` | Executable commands | `executor.command[name]` |
| 3 | **hooks** | `hooks/` | Lifecycle hooks | `executor.hook[name]` |
| 4 | **integrations** | `integrations/` | External integrations | `executor.integration[name]` |
| 5 | **mcp** | `mcp/` | MCP server definitions (sources) | `executor.mcp[name]` ✓ existing |
| 6 | **plugins** | `plugins/` | Plugin modules | `executor.plugin[name]` |
| 7 | **rules** | `rules/` | Domain-specific rules | `executor.rule[name]` |
| 8 | **skills** | `skills/` | Skill definitions | `executor.skill[name]` |
| 9 | **subagents** | `subagents/` | Subagent definitions | `executor.subagent[name]` |

---

## User Experience

### Current (tools only)
```typescript
// Discover and call tools
const matches = await tools.discover({ query: "search code", limit: 10 });
const result = await tools.kotadb.search({ query: "foo" });
```

### Target (all primitives)
```typescript
// Skills — load and execute skill content
const skill = await executor.skill.load({ name: "starting-session" });
const result = await executor.skill.execute({ name: "starting-session", context: {...} });

// Rules — read and apply rule content
const rule = await executor.rule.read({ name: "solidjs" });

// Subagents — delegate to subagent
const result = await executor.subagent.delegate({ name: "task-executor", input: {...} });

// Commands — execute command
const result = await executor.command.run({ name: "git-commit", args: [...] });

// Tools (existing) — unchanged
const result = await tools.kotadb.search({ query: "foo" });
```

---

## Architectural Changes

### 1. New Package: `@executor/primitives-core`

**Responsibility:** Universal primitive loading, discovery, and invocation.

**Key Abstractions:**

```typescript
// Primitive type enum
type PrimitiveType = 
  | "agent-file" | "commands" | "hooks" | "integrations" 
  | "mcp" | "plugins" | "rules" | "skills" | "subagents";

// Universal primitive descriptor
type PrimitiveDescriptor = {
  type: PrimitiveType;
  name: string;
  path: string;           // filesystem path
  namespace: string;      // e.g., "skill", "rule"
  content?: string;       // loaded content
  metadata: PrimitiveMetadata;
  operations: PrimitiveOperation[];  // available operations
};

// Primitive operations (what can be done with this primitive)
type PrimitiveOperation = 
  | { kind: "load"; handler: () => Promise<string> }
  | { kind: "execute"; handler: (input: unknown) => Promise<unknown> }
  | { kind: "delegate"; handler: (input: unknown) => Promise<unknown> }
  | { kind: "read"; handler: () => Promise<string> };
```

### 2. Primitive Loaders

Each primitive type has a loader that knows how to:
- Scan its directory (`~/Documents/_agents/schema/{type}/`)
- Parse file formats (YAML frontmatter + content, JSON, etc.)
- Extract metadata
- Expose operations

```typescript
// packages/primitives-core/src/loaders/skill-loader.ts
export const createSkillLoader = (basePath: string) => ({
  type: "skills" as const,
  scan: async () => {
    // Find all SKILL.md files in ~/Documents/_agents/schema/skills/
    // Return skill descriptors with metadata
  },
  operations: {
    load: async (name: string) => {
      // Read skill file content
    },
    execute: async (name: string, context: unknown) => {
      // Parse skill YAML frontmatter
      // Execute skill logic with context
    }
  }
});
```

### 3. Extended Execution Environment

Modify `workspace-execution-environment.ts` to:

1. **Add primitive catalog alongside tool catalog**
2. **Expose primitives namespace in execution context**

```typescript
// In execution environment resolver
const primitiveCatalog = await createPrimitiveCatalog({
  basePath: "~/Documents/_agents/schema",
  primitiveTypes: ["skills", "rules", "subagents", "commands", "hooks", "integrations", "plugins", "agent-file"]
});

// In execution context
const executionContext = {
  tools: toolCatalog,           // existing
  executor: {
    // Existing internal tools
    sources: { add: ..., list: ... },
    
    // NEW: Primitive accessors
    skill: primitiveCatalog.skills,
    rule: primitiveCatalog.rules,
    subagent: primitiveCatalog.subagents,
    command: primitiveCatalog.commands,
    hook: primitiveCatalog.hooks,
    integration: primitiveCatalog.integrations,
    plugin: primitiveCatalog.plugins,
    agentFile: primitiveCatalog.agentFiles,
    mcp: primitiveCatalog.mcps,  // bridge to existing MCP sources
  }
};
```

### 4. Primitive Catalog Interface

```typescript
type PrimitiveCatalog = {
  // List all primitives of this type
  list: (filter?: { query?: string; limit?: number }) => Promise<PrimitiveDescriptor[]>;
  
  // Get a specific primitive
  get: (name: string) => Promise<PrimitiveDescriptor | undefined>;
  
  // Operations depend on primitive type
  load?: (name: string) => Promise<string>;
  execute?: (name: string, input: unknown) => Promise<unknown>;
  delegate?: (name: string, input: unknown) => Promise<unknown>;
  read?: (name: string) => Promise<string>;
};
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)
**Goal:** Single primitive type working end-to-end

1. Create `@executor/primitives-core` package
2. Implement `SkillLoader` as proof of concept
3. Extend execution environment with `executor.skill` namespace
4. Test: `executor.skill.load("starting-session")` works in execution

**Files to touch:**
- `packages/primitives-core/` (new)
- `packages/control-plane/src/runtime/workspace-execution-environment.ts`
- `packages/control-plane/src/runtime/executor-tools.ts` (add primitive tools)

### Phase 2: Expand to High-Value Primitives
**Goal:** Skills + Rules + Subagents (the "big 3")

1. Implement `RuleLoader` (reads rule://name files)
2. Implement `SubagentLoader` (integrates with subagent-mcp)
3. Wire up `executor.rule` and `executor.subagent` namespaces

### Phase 3: Complete the 9
**Goal:** All primitive types supported

1. Implement remaining loaders: commands, hooks, integrations, plugins, agent-file
2. MCP primitive acts as bridge to existing source system
3. Unified primitive discovery API

### Phase 4: Integration & Polish
**Goal:** Seamless developer experience

1. Add primitive discovery to `tools.discover()`
2. Add primitive inspection to source inspection UI
3. Document primitive routing patterns

---

## File Structure

```
packages/
  primitives-core/
    src/
      index.ts                    # exports
      types.ts                    # shared types
      catalog.ts                  # PrimitiveCatalog implementation
      loaders/
        skill-loader.ts           # skills/SKILL.md loader
        rule-loader.ts            # rules/RULE.md loader
        subagent-loader.ts        # subagents/ + MCP bridge
        command-loader.ts         # commands/ loader
        hook-loader.ts            # hooks/ loader
        integration-loader.ts     # integrations/ loader
        plugin-loader.ts          # plugins/ loader
        agent-file-loader.ts      # agent-file/ loader
        mcp-loader.ts             # mcp/ bridge to sources
      operations/
        load.ts                   # load operation
        execute.ts                # execute operation
        delegate.ts               # delegate operation
```

---

## Key Design Decisions

### 1. Filesystem-First, Not Database
Primitives live in `~/Documents/_agents/schema/` as files. No SQL persistence needed — the filesystem IS the store. This matches the current skill/rule system.

### 2. Lazy Loading
Primitives are discovered by directory scan but content is loaded on demand. Metadata (from YAML frontmatter) is cached.

### 3. Operation Per Primitive
Different primitives support different operations:
- **skills**: load, execute
- **rules**: read, apply
- **subagents**: delegate
- **commands**: run
- **mcp**: connect, listTools

### 4. Namespace Routing
```typescript
// These are equivalent:
executor.skill["starting-session"]
executor.skills.get("starting-session")
```

### 5. Backward Compatibility
Existing `tools.*` and `executor.sources.*` APIs unchanged. Primitives are additive.

---

## Open Questions

1. **Should skills be executable in the executor runtime?** Or do they return content that's used by the caller?
2. **Subagent routing:** Should `executor.subagent.delegate()` call the subagent-mcp server (port 3096), or load the definition and execute inline?
3. **Rules:** Are rules content-only (read and apply pattern), or do they have executable logic?
4. **Integration with existing source system:** MCP sources are currently in the database. Should the `mcp` primitive be a view over sources, or a separate filesystem-based registry?

---

## Success Criteria

- [ ] Can call `executor.skill.load("starting-session")` in TypeScript execution
- [ ] Can call `executor.rule.read("solidjs")` and get rule content
- [ ] Can call `executor.subagent.delegate("task-executor", {...})`
- [ ] All 9 primitive types have defined loaders and operations
- [ ] Existing tool execution still works unchanged
- [ ] New primitives appear in `tools.discover()` results

---

## Appendix: Primitive Schema Definitions

```typescript
// Skill YAML frontmatter
interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  triggers?: string[];  // when to auto-suggest this skill
}

// Rule YAML frontmatter  
interface RuleMetadata {
  name: string;
  description: string;
  domain: string;       // file pattern, e.g., "**/*.tsx"
  appliesTo: string[];  // when this rule is relevant
}

// Subagent definition
interface SubagentMetadata {
  name: string;
  description: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];     // tool namespaces this subagent can use
}
```
