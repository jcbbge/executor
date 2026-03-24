import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Hook metadata from script comments
 */
export interface HookMetadata {
  name: string;
  description?: string;
  shebang?: string;
}

/**
 * Hook record with content
 */
export interface Hook {
  name: string;
  metadata: HookMetadata;
  content: string; // Full shell script content
  path: string; // Filesystem path
}

/**
 * Configuration for hook loading.
 * Path can be overridden via AGENTS_SCHEMA_PATH env var.
 */
export interface HookLoaderConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
  /** Subdirectory for hooks. Defaults to "hooks" */
  hooksSubdir?: string;
}

const DEFAULT_HOOKS_SUBDIR = "hooks";

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
 * Parse hook metadata from shell script content
 * - shebang: first line (e.g., #!/bin/bash)
 * - description: second line after '# ' prefix (e.g., # Description text)
 */
const parseHookMetadata = (content: string): HookMetadata => {
  const lines = content.split("\n");

  const shebang = lines[0]?.startsWith("#!") ? lines[0].trim() : undefined;

  // Description from second line if it starts with '# '
  let description: string | undefined;
  if (lines[1]?.startsWith("# ")) {
    description = lines[1].slice(2).trim();
  }

  return {
    name: "unknown",
    description,
    shebang,
  };
};

/**
 * Hook loader service
 */
export interface HookLoader {
  /** Load a specific hook by name (filename without .sh extension) */
  load(name: string): Effect.Effect<Hook, Error>;
  /** List all available hooks */
  list(): Effect.Effect<HookMetadata[], Error>;
  /** Check if a hook exists */
  exists(name: string): Effect.Effect<boolean, Error>;
}

/**
 * Create a hook loader
 * @param config - Optional configuration
 */
export const createHookLoader = (config?: HookLoaderConfig): HookLoader => {
  const basePath = resolveSchemaPath(config?.basePath);
  const hooksPath = join(basePath, config?.hooksSubdir || DEFAULT_HOOKS_SUBDIR);

  const loadHookFile = async (filename: string): Promise<Hook> => {
    const hookFilePath = join(hooksPath, filename);
    const content = await readFile(hookFilePath, "utf-8");
    const metadata = parseHookMetadata(content);

    // Extract name from filename (remove .sh extension)
    const name = filename.replace(/\.sh$/, "");

    return {
      name,
      metadata: {
        ...metadata,
        name,
      },
      content,
      path: hookFilePath,
    };
  };

  return {
    load: (name) =>
      Effect.tryPromise({
        try: async () => {
          // Hooks are flat files: hooks/{name}.sh
          const filename = name.endsWith(".sh") ? name : `${name}.sh`;
          return await loadHookFile(filename);
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to load hook "${name}": ${error.message}`);
          }
          return new Error(`Failed to load hook "${name}": ${String(error)}`);
        },
      }),

    list: () =>
      Effect.tryPromise({
        try: async () => {
          const entries = await readdir(hooksPath, { withFileTypes: true });
          const hooks: HookMetadata[] = [];

          for (const entry of entries) {
            // Only process .sh files
            if (entry.isFile() && entry.name.endsWith(".sh")) {
              try {
                const hook = await loadHookFile(entry.name);
                hooks.push(hook.metadata);
              } catch {
                // Skip files that can't be parsed
              }
            }
          }

          return hooks.sort((a, b) => a.name.localeCompare(b.name));
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to list hooks: ${error.message}`);
          }
          return new Error(`Failed to list hooks: ${String(error)}`);
        },
      }),

    exists: (name) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const filename = name.endsWith(".sh") ? name : `${name}.sh`;
            await loadHookFile(filename);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => new Error("Failed to check hook existence"),
      }),
  };
};

/**
 * Get the default hook loader (uses env var or default path)
 */
export const getDefaultHookLoader = (): HookLoader => {
  return createHookLoader();
};
