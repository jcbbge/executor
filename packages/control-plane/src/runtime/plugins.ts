import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Plugin metadata from YAML frontmatter
 */
export interface PluginMetadata {
  name?: string;
  description?: string;
  disableModelInvocation?: boolean;
}

/**
 * Plugin record with content
 */
export interface Plugin {
  name: string;
  metadata: PluginMetadata;
  content: string; // Full markdown content after frontmatter
  path: string; // Filesystem path
}

/**
 * Configuration for plugin loading.
 * Path can be overridden via AGENTS_SCHEMA_PATH env var.
 */
export interface PluginLoaderConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
  /** Subdirectory for plugins. Defaults to "plugins" */
  pluginsSubdir?: string;
}

const DEFAULT_PLUGINS_SUBDIR = "plugins";

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
const parseFrontmatter = (content: string): { metadata: PluginMetadata; body: string } => {
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

  // Simple YAML parser for basic types
  const metadata = parseSimpleYaml(yamlText);

  return {
    metadata: {
      name: metadata.name ? String(metadata.name) : undefined,
      description: metadata.description ? String(metadata.description) : undefined,
      disableModelInvocation: metadata["disable-model-invocation"] === true ||
        metadata["disable-model-invocation"] === "true",
    },
    body,
  };
};

/**
 * Parse simple YAML (key: value or key:\n  - item)
 * Does NOT handle nested objects deeply - only 1-2 levels for plugin metadata
 */
const parseSimpleYaml = (yaml: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line - end current list if any
    if (trimmed === "") {
      if (currentKey && currentList.length > 0) {
        result[currentKey] = currentList;
        currentList = [];
        currentKey = null;
      }
      continue;
    }

    // List item
    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim();
      // Remove quotes if present
      const cleanItem = item.replace(/^["'](.*)["']$/, "$1");
      if (currentKey) {
        currentList.push(cleanItem);
      }
      continue;
    }

    // Key: value
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      // Save previous list if any
      if (currentKey && currentList.length > 0) {
        result[currentKey] = currentList;
        currentList = [];
      }

      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      // Check for inline array: key: [item1, item2, "item3"]
      if (value.startsWith("[") && value.endsWith("]")) {
        // Parse inline array
        const arrayContent = value.slice(1, -1);
        const items = arrayContent.split(",").map(item => {
          const trimmedItem = item.trim();
          // Remove quotes if present
          return trimmedItem.replace(/^["'](.*)["']$/, "$1");
        }).filter(item => item.length > 0);
        result[key] = items;
        currentKey = null;
        continue;
      }

      // If value is empty, might be a nested object or list
      if (value === "") {
        currentKey = key;
      } else {
        // Parse booleans
        if (value === "true") {
          result[key] = true;
        } else if (value === "false") {
          result[key] = false;
        } else if (/^-?\d+$/.test(value)) {
          result[key] = parseInt(value, 10);
        } else if (/^-?\d+\.\d+$/.test(value)) {
          result[key] = parseFloat(value);
        } else {
          // Remove quotes if present
          result[key] = value.replace(/^["'](.*)["']$/, "$1");
        }
        currentKey = null;
      }
    }
  }

  // Handle trailing list
  if (currentKey && currentList.length > 0) {
    result[currentKey] = currentList;
  }

  return result;
};

/**
 * Plugin loader service
 */
export interface PluginLoader {
  /** Load a specific plugin by name (filename without .md extension) */
  load(name: string): Effect.Effect<Plugin, Error>;
  /** List all available plugins */
  list(): Effect.Effect<PluginMetadata[], Error>;
  /** Check if a plugin exists */
  exists(name: string): Effect.Effect<boolean, Error>;
}

/**
 * Create a plugin loader
 * @param config - Optional configuration
 */
export const createPluginLoader = (config?: PluginLoaderConfig): PluginLoader => {
  const basePath = resolveSchemaPath(config?.basePath);
  const pluginsPath = join(basePath, config?.pluginsSubdir || DEFAULT_PLUGINS_SUBDIR);

  const loadPluginFile = async (filename: string): Promise<Plugin> => {
    const pluginFilePath = join(pluginsPath, filename);
    const content = await readFile(pluginFilePath, "utf-8");
    const { metadata, body } = parseFrontmatter(content);

    // Extract name from filename (remove .md extension)
    const name = filename.replace(/\.md$/, "");

    return {
      name,
      metadata: {
        ...metadata,
        name: metadata.name || name,
      },
      content: body,
      path: pluginFilePath,
    };
  };

  return {
    load: (name) =>
      Effect.tryPromise({
        try: async () => {
          // Plugins are flat files: plugins/{name}.md
          const filename = name.endsWith(".md") ? name : `${name}.md`;
          return await loadPluginFile(filename);
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to load plugin "${name}": ${error.message}`);
          }
          return new Error(`Failed to load plugin "${name}": ${String(error)}`);
        },
      }),

    list: () =>
      Effect.tryPromise({
        try: async () => {
          const entries = await readdir(pluginsPath, { withFileTypes: true });
          const plugins: PluginMetadata[] = [];

          for (const entry of entries) {
            // Only process .md files (not directories, not README.md)
            if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
              try {
                const plugin = await loadPluginFile(entry.name);
                plugins.push(plugin.metadata);
              } catch {
                // Skip files without valid frontmatter
              }
            }
          }

          return plugins.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to list plugins: ${error.message}`);
          }
          return new Error(`Failed to list plugins: ${String(error)}`);
        },
      }),

    exists: (name) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const filename = name.endsWith(".md") ? name : `${name}.md`;
            await loadPluginFile(filename);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => new Error("Failed to check plugin existence"),
      }),
  };
};

/**
 * Get the default plugin loader (uses env var or default path)
 */
export const getDefaultPluginLoader = (): PluginLoader => {
  return createPluginLoader();
};
