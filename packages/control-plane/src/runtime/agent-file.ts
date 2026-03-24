import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Agent file loader service
 * Special case: loads the single AGENTS.md file for agent identity/foundation
 */
export interface AgentFile {
  name: string;
  content: string;
  path: string;
}

export interface AgentFileLoader {
  /** Load the full AGENTS.md content */
  load(): Effect.Effect<AgentFile, Error>;
}

/**
 * Configuration for agent file loading.
 * Path can be overridden via AGENTS_SCHEMA_PATH env var.
 */
export interface AgentFileLoaderConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
  /** Subdirectory for agent-file. Defaults to "agent-file" */
  agentFileSubdir?: string;
}

const DEFAULT_AGENT_FILE_SUBDIR = "agent-file";
const AGENTS_FILENAME = "AGENTS.md";

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
 * Create an agent file loader
 * @param config - Optional configuration
 */
export const createAgentFileLoader = (config?: AgentFileLoaderConfig): AgentFileLoader => {
  const basePath = resolveSchemaPath(config?.basePath);
  const agentFilePath = join(basePath, config?.agentFileSubdir || DEFAULT_AGENT_FILE_SUBDIR, AGENTS_FILENAME);

  return {
    load: () =>
      Effect.tryPromise({
        try: async () => {
          const content = await readFile(agentFilePath, "utf-8");
          return {
            name: "AGENTS",
            content,
            path: agentFilePath,
          };
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to load ${AGENTS_FILENAME}: ${error.message}`);
          }
          return new Error(`Failed to load ${AGENTS_FILENAME}: ${String(error)}`);
        },
      }),
  };
};

/**
 * Get the default agent file loader (uses env var or default path)
 */
export const getDefaultAgentFileLoader = (): AgentFileLoader => {
  return createAgentFileLoader();
};
