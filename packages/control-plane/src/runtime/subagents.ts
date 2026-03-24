import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Subagent metadata from YAML frontmatter
 */
export interface SubagentMetadata {
  name?: string;
  description?: string;
  provider?: string;
  model?: string;
  tools?: string[];
  temperature?: number;
}

/**
 * Subagent record with content
 */
export interface Subagent {
  name: string;
  metadata: SubagentMetadata;
  content: string; // Full content after frontmatter (system prompt)
  path: string; // Filesystem path
}

/**
 * Configuration for subagent loading.
 * Path can be overridden via AGENTS_SCHEMA_PATH env var.
 */
export interface SubagentLoaderConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
  /** Subdirectory for subagents. Defaults to "subagents" */
  subagentsSubdir?: string;
}

const DEFAULT_SUBAGENTS_SUBDIR = "subagents";

/**
 * Resolve the schema base path.
 * Priority: 1) config.basePath, 2) AGENTS_SCHEMA_PATH env var, 3) default ~/Documents/_agents/schema
 */
const resolveSchemaPath = (configBasePath?: string): string => {
  if (configBasePath) {
    return resolve(expandHome(configBasePath));
  }
  if (process.env.AGENTS_SCHEMA_PATH) {
    return resolve(expandHome(process.env.AGENTS_SCHEMA_PATH));
  }
  return resolve(join(homedir(), "Documents", "_agents", "schema"));
};

/**
 * Expand ~ to home directory
 */
const expandHome = (path: string): string => {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
};

/**
 * Parse YAML frontmatter from markdown content
 * Returns metadata and remaining content
 */
const parseFrontmatter = (content: string): { metadata: SubagentMetadata; body: string } => {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = frontmatterRegex.exec(content);

  if (!match) {
    return {
      metadata: { name: "unknown" },
      body: content,
    };
  }

  const yamlText = match[1];
  const body = match[2];
  const metadata = parseSimpleYaml(yamlText);

  return {
    metadata: {
      name: metadata.name ? String(metadata.name) : undefined,
      description: metadata.description ? String(metadata.description) : undefined,
      provider: metadata.provider ? String(metadata.provider) : undefined,
      model: metadata.model ? String(metadata.model) : undefined,
      tools: Array.isArray(metadata.tools) ? metadata.tools.map(String) : undefined,
      temperature: typeof metadata.temperature === "number" ? metadata.temperature : undefined,
    },
    body,
  };
};

/**
 * Parse simple YAML (key: value or key:\n  - item)
 */
const parseSimpleYaml = (yaml: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      if (currentKey && currentList.length > 0) {
        result[currentKey] = currentList;
        currentList = [];
        currentKey = null;
      }
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim().replace(/^["'](.*)["']$/, "$1");
      if (currentKey) {
        currentList.push(item);
      }
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

      // Inline array: key: [item1, item2]
      if (value.startsWith("[") && value.endsWith("]")) {
        const arrayContent = value.slice(1, -1);
        const items = arrayContent.split(",").map(item => {
          return item.trim().replace(/^["'](.*)["']$/, "$1");
        }).filter(item => item.length > 0);
        result[key] = items;
        currentKey = null;
        continue;
      }

      if (value === "") {
        currentKey = key;
      } else {
        // Parse numbers
        if (/^-?\d+$/.test(value)) {
          result[key] = parseInt(value, 10);
        } else if (/^-?\d+\.\d+$/.test(value)) {
          result[key] = parseFloat(value);
        } else {
          result[key] = value.replace(/^["'](.*)["']$/, "$1");
        }
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
 * Delegate input for subagent execution
 */
export interface SubagentDelegateInput {
  name: string;
  input: string;
}

/**
 * Execute-with-system-prompt input — creates a temporary subagent session, runs it, destroys it.
 * Used by executor.skill.execute and executor.command.run.
 */
export interface ExecuteWithSystemPromptInput {
  systemPrompt: string;
  context: string;
  /** OpenRouter model ID. Defaults to SKILL_EXECUTE_MODEL env var or anthropic/claude-sonnet-4-6 */
  model?: string;
  /** Provider. Defaults to "openrouter" */
  provider?: string;
}

const DEFAULT_EXECUTE_MODEL = "anthropic/claude-sonnet-4-6";
const DEFAULT_EXECUTE_PROVIDER = "openrouter";

/**
 * Subagent loader service
 */
export interface SubagentLoader {
  /** Load a specific subagent by name */
  load(name: string): Effect.Effect<Subagent, Error>;
  /** List all available subagents */
  list(): Effect.Effect<SubagentMetadata[], Error>;
  /** Check if a subagent exists */
  exists(name: string): Effect.Effect<boolean, Error>;
  /** Delegate to a subagent via subagent-mcp */
  delegate(input: SubagentDelegateInput): Effect.Effect<string, Error>;
  /**
   * Execute arbitrary content as a one-shot subagent: create → delegate → destroy.
   * Used by executor.skill.execute and executor.command.run to run primitive content.
   */
  executeWithSystemPrompt(input: ExecuteWithSystemPromptInput): Effect.Effect<string, Error>;
}

/**
 * Create a subagent loader
 * @param config - Optional configuration
 */
export const createSubagentLoader = (config?: SubagentLoaderConfig): SubagentLoader => {
  const basePath = resolveSchemaPath(config?.basePath);
  const subagentsPath = join(basePath, config?.subagentsSubdir || DEFAULT_SUBAGENTS_SUBDIR);

  const loadSubagentFile = async (filename: string): Promise<Subagent> => {
    const subagentFilePath = join(subagentsPath, filename);
    const content = await readFile(subagentFilePath, "utf-8");
    const { metadata, body } = parseFrontmatter(content);

    const name = filename.replace(/\.md$/, "");

    return {
      name,
      metadata: {
        ...metadata,
        name: metadata.name || name,
      },
      content: body,
      path: subagentFilePath,
    };
  };

  return {
    load: (name) =>
      Effect.tryPromise({
        try: async () => {
          const filename = name.endsWith(".md") ? name : `${name}.md`;
          return await loadSubagentFile(filename);
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to load subagent "${name}": ${error.message}`);
          }
          return new Error(`Failed to load subagent "${name}": ${String(error)}`);
        },
      }),

    list: () =>
      Effect.tryPromise({
        try: async () => {
          const entries = await readdir(subagentsPath, { withFileTypes: true });
          const subagents: SubagentMetadata[] = [];

          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".md") && 
                entry.name !== "README.md" && entry.name !== "AGENTS.md") {
              try {
                const subagent = await loadSubagentFile(entry.name);
                subagents.push(subagent.metadata);
              } catch {
                // Skip files without valid frontmatter
              }
            }
          }

          return subagents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to list subagents: ${error.message}`);
          }
          return new Error(`Failed to list subagents: ${String(error)}`);
        },
      }),

    exists: (name) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const filename = name.endsWith(".md") ? name : `${name}.md`;
            await loadSubagentFile(filename);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => new Error("Failed to check subagent existence"),
      }),

    delegate: (input) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch("http://127.0.0.1:3096/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              params: {
                name: "subagents_delegate",
                arguments: {
                  agent: input.name,
                  input: input.input,
                },
              },
              id: crypto.randomUUID(),
            }),
          });

          if (!response.ok) {
            throw new Error(`Subagent-mcp error: ${response.status} ${response.statusText}`);
          }

          // Parse SSE response - handle both \n and \r\n line endings
          const responseText = await response.text();
          const lines = responseText.split(/\r?\n/);
          let resultData: any = null;

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6);
                const parsed = JSON.parse(jsonStr);
                if (parsed.result) {
                  resultData = parsed.result;
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }

          if (!resultData) {
            throw new Error("No valid response from subagent-mcp");
          }

          const content = resultData.content;
          if (Array.isArray(content)) {
            return content.map((c: any) => c.text || String(c)).join("\n");
          }
          return content || resultData || "No response from subagent";
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Subagent delegation failed: ${error.message}`);
          }
          return new Error(`Subagent delegation failed: ${String(error)}`);
        },
      }),

    executeWithSystemPrompt: (input) =>
      Effect.tryPromise({
        try: async () => {
          const sessionName = `exec-${crypto.randomUUID().slice(0, 8)}`;
          const model = input.model ?? process.env.SKILL_EXECUTE_MODEL ?? DEFAULT_EXECUTE_MODEL;
          const provider = input.provider ?? DEFAULT_EXECUTE_PROVIDER;

          const callMcp = async (toolName: string, args: Record<string, unknown>) => {
            const resp = await fetch("http://127.0.0.1:3096/", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/call",
                params: { name: toolName, arguments: args },
                id: crypto.randomUUID(),
              }),
            });
            if (!resp.ok) {
              throw new Error(`subagent-mcp ${toolName} failed: ${resp.status} ${resp.statusText}`);
            }
            const text = await resp.text();
            for (const line of text.split(/\r?\n/)) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.result) return parsed.result;
                } catch { /* skip */ }
              }
            }
            return null;
          };

          // Create ephemeral session
          await callMcp("subagents_create", {
            name: sessionName,
            provider,
            model,
            systemPrompt: input.systemPrompt,
          });

          // Run the skill/command content with provided context
          let result = "";
          try {
            const delegateResult = await callMcp("subagents_delegate", {
              agent: sessionName,
              input: input.context,
            });
            const content = delegateResult?.content;
            if (Array.isArray(content)) {
              result = content.map((c: unknown) => (c as { text?: string }).text || String(c)).join("\n");
            } else {
              result = content || delegateResult || "No response";
            }
          } finally {
            // Always clean up the session
            try {
              await callMcp("subagents_destroy", { name: sessionName });
            } catch { /* best-effort cleanup */ }
          }

          return result;
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Skill execution failed: ${error.message}`);
          }
          return new Error(`Skill execution failed: ${String(error)}`);
        },
      }),
  };
};

/**
 * Get the default subagent loader
 */
export const getDefaultSubagentLoader = (): SubagentLoader => {
  return createSubagentLoader();
};
