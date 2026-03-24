import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Primitive types supported by the executor
 */
export type PrimitiveType =
  | "skill"
  | "rule"
  | "subagent"
  | "command"
  | "hook"
  | "integration"
  | "plugin"
  | "agent-file"
  | "mcp";

/**
 * All primitive types as an array for iteration
 */
export const ALL_PRIMITIVE_TYPES: PrimitiveType[] = [
  "skill",
  "rule",
  "subagent",
  "command",
  "hook",
  "integration",
  "plugin",
  "agent-file",
  "mcp",
];

/**
 * Metadata for any primitive type
 */
export interface PrimitiveMetadata {
  /** Primitive name (filename or declared name) */
  name: string;
  /** Optional description from frontmatter */
  description?: string;
  /** The type of primitive */
  type: PrimitiveType;
  /** Filesystem path to the primitive */
  path: string;
  /** Additional type-specific metadata */
  [key: string]: unknown;
}

/**
 * Configuration for primitives discovery
 */
export interface PrimitivesConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
}

/**
 * Result of discovering primitives
 */
export interface PrimitivesDiscoveryResult {
  /** All primitives found, grouped by type */
  byType: Record<PrimitiveType, PrimitiveMetadata[]>;
  /** Flat list of all primitives */
  all: PrimitiveMetadata[];
  /** Total count */
  count: number;
  /** Count per type */
  countByType: Record<PrimitiveType, number>;
}

/**
 * Help documentation for LLM consumption
 */
export interface PrimitivesHelp {
  /** Quick start guide */
  quickStart: string;
  /** Available primitives with usage examples */
  primitives: Record<PrimitiveType, {
    description: string;
    usage: string;
    example: string;
    loadMethod: string;
    listMethod: string;
  }>;
  /** Common patterns */
  patterns: string[];
  /** Configuration options */
  configuration: string;
  /** Troubleshooting */
  troubleshooting: string[];
}

const resolveSchemaPath = (basePath?: string): string => {
  if (basePath) {
    return resolve(basePath.startsWith("~/") 
      ? join(homedir(), basePath.slice(2)) 
      : basePath);
  }
  if (process.env.AGENTS_SCHEMA_PATH) {
    const envPath = process.env.AGENTS_SCHEMA_PATH;
    return resolve(envPath.startsWith("~/") 
      ? join(homedir(), envPath.slice(2)) 
      : envPath);
  }
  return resolve(join(homedir(), "Documents", "_agents", "schema"));
};

/**
 * Parse simple YAML frontmatter
 */
const parseFrontmatter = (content: string): Record<string, unknown> => {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = frontmatterRegex.exec(content);
  
  if (!match) return {};
  
  const yamlText = match[1];
  const result: Record<string, unknown> = {};
  const lines = yamlText.split("\n");
  let currentKey: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim().replace(/^["'](.*)["']$/, "$1");
      if (currentKey) currentList.push(item);
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      if (currentKey && currentList.length > 0) {
        result[currentKey] = currentList;
        currentList = [];
      }

      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      if (value.startsWith("[") && value.endsWith("]")) {
        const items = value.slice(1, -1).split(",").map(s => 
          s.trim().replace(/^["'](.*)["']$/, "$1")
        ).filter(s => s);
        result[key] = items;
        currentKey = null;
      } else if (value === "") {
        currentKey = key;
      } else {
        result[key] = value.replace(/^["'](.*)["']$/, "$1");
        currentKey = null;
      }
    }
  }

  if (currentKey && currentList.length > 0) {
    result[currentKey] = currentList;
  }

  return result;
};

/**
 * Discover all primitives from the filesystem
 */
export const discoverPrimitives = (
  config?: PrimitivesConfig
): Effect.Effect<PrimitivesDiscoveryResult, Error> => {
  const basePath = resolveSchemaPath(config?.basePath);

  return Effect.tryPromise({
    try: async () => {
      const byType: Record<PrimitiveType, PrimitiveMetadata[]> = {
        skill: [],
        rule: [],
        subagent: [],
        command: [],
        hook: [],
        integration: [],
        plugin: [],
        "agent-file": [],
        mcp: [],
      };

      // Discover skills (directory-based: skills/{name}/SKILL.md)
      try {
        const skillsPath = join(basePath, "skills");
        const skillDirs = await readdir(skillsPath, { withFileTypes: true });
        for (const dir of skillDirs) {
          if (dir.isDirectory()) {
            try {
              const skillFile = join(skillsPath, dir.name, "SKILL.md");
              const content = await readFile(skillFile, "utf-8");
              const meta = parseFrontmatter(content);
              byType.skill.push({
                name: meta.name as string || dir.name,
                description: meta.description as string,
                type: "skill",
                path: skillFile,
                ...meta,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover rules (file-based: rules/{name}.md)
      try {
        const rulesPath = join(basePath, "rules");
        const ruleFiles = await readdir(rulesPath, { withFileTypes: true });
        for (const file of ruleFiles) {
          if (file.isFile() && file.name.endsWith(".md") && !file.name.startsWith("README")) {
            try {
              const ruleFile = join(rulesPath, file.name);
              const content = await readFile(ruleFile, "utf-8");
              const meta = parseFrontmatter(content);
              const name = file.name.replace(/\.md$/, "");
              byType.rule.push({
                name: meta.name as string || name,
                description: meta.description as string,
                type: "rule",
                path: ruleFile,
                globs: meta.globs,
                ...meta,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover subagents (file-based: subagents/{name}.md)
      try {
        const subagentsPath = join(basePath, "subagents");
        const files = await readdir(subagentsPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith(".md") && 
              !file.name.startsWith("README") && !file.name.startsWith("AGENTS")) {
            try {
              const filePath = join(subagentsPath, file.name);
              const content = await readFile(filePath, "utf-8");
              const meta = parseFrontmatter(content);
              const name = file.name.replace(/\.md$/, "");
              byType.subagent.push({
                name: meta.name as string || name,
                description: meta.description as string,
                type: "subagent",
                path: filePath,
                provider: meta.provider,
                model: meta.model,
                tools: meta.tools,
                ...meta,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover commands (file-based: commands/{name}.md)
      try {
        const commandsPath = join(basePath, "commands");
        const files = await readdir(commandsPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith(".md") && !file.name.startsWith("README")) {
            try {
              const filePath = join(commandsPath, file.name);
              const content = await readFile(filePath, "utf-8");
              const meta = parseFrontmatter(content);
              const name = file.name.replace(/\.md$/, "");
              byType.command.push({
                name: meta.name as string || name,
                description: meta.description as string,
                type: "command",
                path: filePath,
                ...meta,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover hooks (file-based: hooks/{name}.sh)
      try {
        const hooksPath = join(basePath, "hooks");
        const files = await readdir(hooksPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith(".sh")) {
            try {
              const filePath = join(hooksPath, file.name);
              const content = await readFile(filePath, "utf-8");
              const name = file.name.replace(/\.sh$/, "");
              // Extract shebang and first comment as description
              const lines = content.split("\n");
              const shebang = lines[0]?.startsWith("#!/") ? lines[0] : undefined;
              const commentDesc = lines.find(l => l.trim().startsWith("# "))?.trim().slice(2);
              byType.hook.push({
                name,
                description: commentDesc,
                type: "hook",
                path: filePath,
                shebang,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover integrations (file-based: integrations/{name}.md)
      try {
        const integrationsPath = join(basePath, "integrations");
        const files = await readdir(integrationsPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith(".md") && !file.name.startsWith("README")) {
            try {
              const filePath = join(integrationsPath, file.name);
              const content = await readFile(filePath, "utf-8");
              const meta = parseFrontmatter(content);
              const name = file.name.replace(/\.md$/, "");
              byType.integration.push({
                name: meta.name as string || name,
                description: meta.description as string,
                type: "integration",
                path: filePath,
                ...meta,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover plugins (file-based: plugins/{name}.md)
      try {
        const pluginsPath = join(basePath, "plugins");
        const files = await readdir(pluginsPath, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith(".md") && !file.name.startsWith("README")) {
            try {
              const filePath = join(pluginsPath, file.name);
              const content = await readFile(filePath, "utf-8");
              const meta = parseFrontmatter(content);
              const name = file.name.replace(/\.md$/, "");
              byType.plugin.push({
                name: meta.name as string || name,
                description: meta.description as string,
                type: "plugin",
                path: filePath,
                ...meta,
              });
            } catch { /* skip invalid */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Discover agent-file (single file: agent-file/AGENTS.md)
      try {
        const agentFilePath = join(basePath, "agent-file", "AGENTS.md");
        const content = await readFile(agentFilePath, "utf-8");
        const meta = parseFrontmatter(content);
        byType["agent-file"].push({
          name: "AGENTS.md",
          description: meta.description as string || "Core agent identity and instructions",
          type: "agent-file",
          path: agentFilePath,
          ...meta,
        });
      } catch { /* file doesn't exist */ }

      // Calculate aggregates
      const all: PrimitiveMetadata[] = ALL_PRIMITIVE_TYPES.flatMap(type => byType[type]);
      const countByType: Record<PrimitiveType, number> = {} as Record<PrimitiveType, number>;
      for (const type of ALL_PRIMITIVE_TYPES) {
        countByType[type] = byType[type].length;
      }

      return {
        byType,
        all,
        count: all.length,
        countByType,
      };
    },
    catch: (error) => {
      if (error instanceof Error) {
        return new Error(`Failed to discover primitives: ${error.message}`);
      }
      return new Error(`Failed to discover primitives: ${String(error)}`);
    },
  });
};

/**
 * Get primitives of a specific type
 */
export const getPrimitivesByType = (
  type: PrimitiveType,
  config?: PrimitivesConfig
): Effect.Effect<PrimitiveMetadata[], Error> => {
  return Effect.map(
    discoverPrimitives(config),
    (result) => result.byType[type] || []
  );
};

/**
 * Get a specific primitive by name and type
 */
export const getPrimitive = (
  name: string,
  type: PrimitiveType,
  config?: PrimitivesConfig
): Effect.Effect<PrimitiveMetadata | null, Error> => {
  return Effect.map(
    discoverPrimitives(config),
    (result) => result.byType[type]?.find(p => p.name === name) || null
  );
};

/**
 * Get comprehensive help documentation for LLM consumption
 * This is designed specifically for AI assistants to understand
 * how to use the executor primitives effectively.
 */
export const getPrimitivesHelp = (): PrimitivesHelp => {
  return {
    quickStart: `
# Executor Primitives - Quick Start for AI Assistants

The executor provides 9 primitive types that you can access via tools.executor.*:

1. skills - Reusable knowledge packs
2. rules - Domain-specific guidelines  
3. subagents - Delegate to specialized agents
4. commands - Slash command definitions
5. hooks - Lifecycle shell scripts
6. integrations - External service configs
7. plugins - Extension modules
8. agent-file - Core identity document
9. mcp - External tool sources

Basic pattern:
const skill = await tools.executor.skill.load({ name: "starting-session" });
const skills = await tools.executor.skill.list();
`,

    primitives: {
      skill: {
        description: "Reusable knowledge packs with specialized expertise. Skills contain markdown content that teaches you how to perform specific tasks.",
        usage: "tools.executor.skill.load({ name: string }) → returns skill content\ntools.executor.skill.list() → returns all available skills",
        example: `// Load a skill to learn specialized knowledge
const skill = await tools.executor.skill.load({ name: "building-with-solidjs" });
console.log(skill.content); // Study this to learn SolidJS patterns

// List all available skills
const skills = await tools.executor.skill.list();
skills.forEach(s => console.log(s.name, s.description));`,
        loadMethod: "executor.skill.load",
        listMethod: "executor.skill.list",
      },

      rule: {
        description: "Domain-specific guidelines that apply to file patterns. Rules help you follow project conventions and best practices.",
        usage: "tools.executor.rule.load({ name: string }) → returns rule content with globs\ntools.executor.rule.list() → returns all rules with their file patterns",
        example: `// Load SolidJS rules before working on .jsx files
const rule = await tools.executor.rule.load({ name: "solidjs" });
console.log(rule.globs); // ["**/*.jsx", "**/*.tsx"]
console.log(rule.content); // Follow these patterns for SolidJS

// Check which rules apply to your current file
const rules = await tools.executor.rule.list();
const applicable = rules.filter(r => 
  r.globs?.some(glob => currentFile.matches(glob))
);`,
        loadMethod: "executor.rule.load",
        listMethod: "executor.rule.list",
      },

      subagent: {
        description: "Specialized AI agents for specific tasks. Delegate complex work to experts (architect, debugger, reviewer, etc.)",
        usage: "tools.executor.subagent.load({ name: string }) → returns subagent definition\ntools.executor.subagent.list() → returns available subagents\ntools.executor.subagent.delegate({ name, input }) → executes subagent with input",
        example: `// Delegate architecture decisions to the architect
const result = await tools.executor.subagent.delegate({
  name: "architect",
  input: "Design a caching layer for this API"
});
console.log(result); // Architect's recommendation

// Get debugger help for a failing test
const debugResult = await tools.executor.subagent.delegate({
  name: "debugger",
  input: "Test 'should calculate total' is failing with NaN"
});`,
        loadMethod: "executor.subagent.load",
        listMethod: "executor.subagent.list",
      },

      command: {
        description: "Slash command definitions that users can invoke. Commands provide quick actions and workflows.",
        usage: "tools.executor.command.load({ name: string }) → returns command definition\ntools.executor.command.list() → returns all available commands",
        example: `// Load a command definition
const cmd = await tools.executor.command.load({ name: "kota" });
console.log(cmd.description); // What the command does

// List available commands for user
const commands = await tools.executor.command.list();
commands.forEach(c => console.log(\`/\${c.name}\`, c.description));`,
        loadMethod: "executor.command.load",
        listMethod: "executor.command.list",
      },

      hook: {
        description: "Lifecycle shell scripts that run at specific times. Hooks enable automation at session start/end, file changes, etc.",
        usage: "tools.executor.hook.load({ name: string }) → returns hook script content\ntools.executor.hook.list() → returns all available hooks",
        example: `// Load a hook to see what it does
const hook = await tools.executor.hook.load({ name: "chain" });
console.log(hook.content); // Shell script that runs on some trigger
console.log(hook.shebang); // #!/bin/bash or similar

// Execute a hook manually if needed
const hook = await tools.executor.hook.load({ name: "validate" });
await tools.bash({ command: hook.content });`,
        loadMethod: "executor.hook.load",
        listMethod: "executor.hook.list",
      },

      integration: {
        description: "External service configurations and connection details. Integrations provide API endpoints, auth patterns, etc.",
        usage: "tools.executor.integration.load({ name: string }) → returns integration config\ntools.executor.integration.list() → returns all integrations",
        example: `// Load database integration details
const db = await tools.executor.integration.load({ name: "rtk" });
console.log(db.endpoint); // Connection details
console.log(db.auth); // Auth configuration

// Use integration to make API calls
const api = await tools.executor.integration.load({ name: "stripe" });
await fetch(api.endpoint, { headers: api.headers });`,
        loadMethod: "executor.integration.load",
        listMethod: "executor.integration.list",
      },

      plugin: {
        description: "Extension modules that add functionality. Plugins extend your capabilities with new behaviors.",
        usage: "tools.executor.plugin.load({ name: string }) → returns plugin definition\ntools.executor.plugin.list() → returns all available plugins",
        example: `// Load a plugin definition
const plugin = await tools.executor.plugin.load({ name: "scratchpad" });
console.log(plugin.content); // How to use this plugin

// Check what plugins are available
const plugins = await tools.executor.plugin.list();
plugins.forEach(p => console.log(p.name, p.version));`,
        loadMethod: "executor.plugin.load",
        listMethod: "executor.plugin.list",
      },

      "agent-file": {
        description: "Core agent identity document (AGENTS.md). Contains system prompt, identity, and foundational instructions.",
        usage: "tools.executor.agentFile.load() → returns the AGENTS.md content\nNote: There is no list() for agent-file as there's only one",
        example: `// Load the agent identity document
const identity = await tools.executor.agentFile.load();
console.log(identity.content); // Core identity and instructions

// Check when identity was last updated
console.log(identity.path); // Path to AGENTS.md
console.log(identity.lastModified); // If available`,
        loadMethod: "executor.agentFile.load",
        listMethod: "N/A (single file)",
      },

      mcp: {
        description: "External tool sources via Model Context Protocol. MCP servers provide additional tools from external services.",
        usage: "tools.executor.mcp.sources.list() → returns connected MCP sources\ntools.{source-name}.{tool}() → call tools from MCP sources",
        example: `// List connected MCP sources
const sources = await tools.executor.mcp.sources.list();
console.log(sources); // ["anima", "kotadb", "dev-brain", "subagent-mcp"]

// Call tools from MCP sources
const memory = await tools.anima.query({ query: "context" });
const results = await tools.kotadb.search({ query: "function" });`,
        loadMethod: "executor.mcp.sources.list / executor.mcp.sources.connect",
        listMethod: "executor.mcp.sources.list",
      },
    },

    patterns: [
      "ALWAYS check for applicable rules before editing files in a domain (SolidJS, Bento, etc.)",
      "DELEGATE complex specialized tasks to subagents rather than solving everything yourself",
      "LOAD relevant skills at session start to acquire domain knowledge quickly",
      "USE commands for user-facing actions, hooks for automation, integrations for external APIs",
      "COMBINE primitives: skill for knowledge + subagent for execution + rule for constraints",
      "INTROSPECT available primitives with executor.primitives.discover() when unsure what's available",
    ],

    configuration: `
# Configuration

Environment variable AGENTS_SCHEMA_PATH overrides the default location:
- Default: ~/Documents/_agents/schema
- Override: AGENTS_SCHEMA_PATH=/custom/path

Each primitive type lives in a subdirectory:
- skills/{name}/SKILL.md
- rules/{name}.md
- subagents/{name}.md
- commands/{name}.md
- hooks/{name}.sh
- integrations/{name}.md
- plugins/{name}.md
- agent-file/AGENTS.md
`,

    troubleshooting: [
      "Tool not found? Verify executor MCP server is running: curl http://localhost:8000/health",
      "Primitive not loading? Check file exists at correct path with proper extension",
      "Subagent delegation failing? Verify subagent-mcp is running on port 3096",
      "Outdated content? Restart session to refresh primitive cache",
      "Wrong primitive loaded? Check AGENTS_SCHEMA_PATH env var is not set to wrong location",
    ],
  };
};

/**
 * Unified primitives service interface
 */
export interface PrimitivesService {
  /** Discover all primitives */
  discover(): Effect.Effect<PrimitivesDiscoveryResult, Error>;
  /** Get primitives by type */
  getByType(type: PrimitiveType): Effect.Effect<PrimitiveMetadata[], Error>;
  /** Get a specific primitive */
  get(name: string, type: PrimitiveType): Effect.Effect<PrimitiveMetadata | null, Error>;
  /** Get comprehensive help for LLMs */
  help(): PrimitivesHelp;
}

/**
 * Create a primitives service
 */
export const createPrimitivesService = (config?: PrimitivesConfig): PrimitivesService => {
  return {
    discover: () => discoverPrimitives(config),
    getByType: (type) => getPrimitivesByType(type, config),
    get: (name, type) => getPrimitive(name, type, config),
    help: getPrimitivesHelp,
  };
};

/**
 * Get the default primitives service
 */
export const getDefaultPrimitivesService = (): PrimitivesService => {
  return createPrimitivesService();
};
