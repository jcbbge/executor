import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Integration metadata from YAML frontmatter
 */
export interface IntegrationMetadata {
  name?: string;
  description?: string;
  provider?: string;
  tools?: string[];
  version?: string;
}

/**
 * Integration record with content
 */
export interface Integration {
  name: string;
  metadata: IntegrationMetadata;
  content: string; // Full markdown content after frontmatter
  path: string; // Filesystem path
}

/**
 * Configuration for integration loading.
 * Path can be overridden via AGENTS_SCHEMA_PATH env var.
 */
export interface IntegrationLoaderConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
  /** Subdirectory for integrations. Defaults to "integrations" */
  integrationsSubdir?: string;
}

const DEFAULT_INTEGRATIONS_SUBDIR = "integrations";

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
const parseFrontmatter = (content: string): { metadata: IntegrationMetadata; body: string } => {
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
      provider: metadata.provider ? String(metadata.provider) : undefined,
      tools: Array.isArray(metadata.tools) ? metadata.tools.map(String) : undefined,
      version: metadata.version ? String(metadata.version) : undefined,
    },
    body,
  };
};

/**
 * Parse simple YAML (key: value or key:\n  - item)
 * Does NOT handle nested objects deeply - only 1-2 levels for integration metadata
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
        // Remove quotes if present
        result[key] = value.replace(/^["'](.*)["']$/, "$1");
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
 * Integration loader service
 */
export interface IntegrationLoader {
  /** Load a specific integration by name (filename without .md extension) */
  load(name: string): Effect.Effect<Integration, Error>;
  /** List all available integrations */
  list(): Effect.Effect<IntegrationMetadata[], Error>;
  /** Check if an integration exists */
  exists(name: string): Effect.Effect<boolean, Error>;
}

/**
 * Create an integration loader
 * @param config - Optional configuration
 */
export const createIntegrationLoader = (config?: IntegrationLoaderConfig): IntegrationLoader => {
  const basePath = resolveSchemaPath(config?.basePath);
  const integrationsPath = join(basePath, config?.integrationsSubdir || DEFAULT_INTEGRATIONS_SUBDIR);

  const loadIntegrationFile = async (filename: string): Promise<Integration> => {
    const integrationFilePath = join(integrationsPath, filename);
    const content = await readFile(integrationFilePath, "utf-8");
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
      path: integrationFilePath,
    };
  };

  return {
    load: (name) =>
      Effect.tryPromise({
        try: async () => {
          // Integrations are flat files: integrations/{name}.md
          const filename = name.endsWith(".md") ? name : `${name}.md`;
          return await loadIntegrationFile(filename);
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to load integration "${name}": ${error.message}`);
          }
          return new Error(`Failed to load integration "${name}": ${String(error)}`);
        },
      }),

    list: () =>
      Effect.tryPromise({
        try: async () => {
          const entries = await readdir(integrationsPath, { withFileTypes: true });
          const integrations: IntegrationMetadata[] = [];

          for (const entry of entries) {
            // Only process .md files (not directories, not README.md)
            if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
              try {
                const integration = await loadIntegrationFile(entry.name);
                integrations.push(integration.metadata);
              } catch {
                // Skip files without valid frontmatter
              }
            }
          }

          return integrations.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to list integrations: ${error.message}`);
          }
          return new Error(`Failed to list integrations: ${String(error)}`);
        },
      }),

    exists: (name) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const filename = name.endsWith(".md") ? name : `${name}.md`;
            await loadIntegrationFile(filename);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => new Error("Failed to check integration existence"),
      }),
  };
};

/**
 * Get the default integration loader (uses env var or default path)
 */
export const getDefaultIntegrationLoader = (): IntegrationLoader => {
  return createIntegrationLoader();
};
