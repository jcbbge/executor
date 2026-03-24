import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";

/**
 * Skill metadata from YAML frontmatter
 */
export interface SkillMetadata {
  name: string;
  description?: string;
  version?: string;
  license?: string;
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
  };
}

/**
 * Skill record with content
 */
export interface Skill {
  name: string;
  metadata: SkillMetadata;
  content: string; // Full markdown content after frontmatter
  path: string; // Filesystem path
}

/**
 * Configuration for skill loading.
 * Path can be overridden via AGENTS_SCHEMA_PATH env var.
 */
export interface SkillLoaderConfig {
  /** Base path to schema directory. Defaults to ~/Documents/_agents/schema */
  basePath?: string;
  /** Subdirectory for skills. Defaults to "skills" */
  skillsSubdir?: string;
}

const DEFAULT_SKILLS_SUBDIR = "skills";

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
const parseFrontmatter = (content: string): { metadata: SkillMetadata; body: string } => {
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
      name: String(metadata.name || "unknown"),
      description: metadata.description ? String(metadata.description) : undefined,
      version: metadata.version ? String(metadata.version) : undefined,
      license: metadata.license ? String(metadata.license) : undefined,
      metadata: metadata.metadata as { author?: string; version?: string; tags?: string[] } | undefined,
    },
    body,
  };
};

/**
 * Parse simple YAML (key: value or key:\n  - item)
 * Does NOT handle nested objects deeply - only 1-2 levels for skill metadata
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
      if (currentKey) {
        currentList.push(item);
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
      const value = trimmed.slice(colonIndex + 1).trim();

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
 * Skill loader service
 */
export interface SkillLoader {
  /** Load a specific skill by name */
  load(name: string): Effect.Effect<Skill, Error>;
  /** List all available skills */
  list(): Effect.Effect<SkillMetadata[], Error>;
  /** Check if a skill exists */
  exists(name: string): Effect.Effect<boolean, Error>;
}

/**
 * Create a skill loader
 * @param config - Optional configuration
 */
export const createSkillLoader = (config?: SkillLoaderConfig): SkillLoader => {
  const basePath = resolveSchemaPath(config?.basePath);
  const skillsPath = join(basePath, config?.skillsSubdir || DEFAULT_SKILLS_SUBDIR);

  const loadSkillFile = async (skillDir: string, skillName: string): Promise<Skill> => {
    const skillFilePath = join(skillsPath, skillDir, "SKILL.md");
    const content = await readFile(skillFilePath, "utf-8");
    const { metadata, body } = parseFrontmatter(content);

    return {
      name: skillName,
      metadata: {
        ...metadata,
        name: metadata.name || skillName,
      },
      content: body,
      path: skillFilePath,
    };
  };

  return {
    load: (name) =>
      Effect.tryPromise({
        try: async () => {
          // Skills are stored in directories named after the skill
          // e.g., skills/starting-session/SKILL.md
          return await loadSkillFile(name, name);
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to load skill "${name}": ${error.message}`);
          }
          return new Error(`Failed to load skill "${name}": ${String(error)}`);
        },
      }),

    list: () =>
      Effect.tryPromise({
        try: async () => {
          const entries = await readdir(skillsPath, { withFileTypes: true });
          const skills: SkillMetadata[] = [];

          for (const entry of entries) {
            if (entry.isDirectory()) {
              try {
                const skill = await loadSkillFile(entry.name, entry.name);
                skills.push(skill.metadata);
              } catch {
                // Skip directories without valid SKILL.md
              }
            }
          }

          return skills.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        },
        catch: (error) => {
          if (error instanceof Error) {
            return new Error(`Failed to list skills: ${error.message}`);
          }
          return new Error(`Failed to list skills: ${String(error)}`);
        },
      }),

    exists: (name) =>
      Effect.tryPromise({
        try: async () => {
          try {
            await loadSkillFile(name, name);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => new Error("Failed to check skill existence"),
      }),
  };
};

/**
 * Get the default skill loader (uses env var or default path)
 */
export const getDefaultSkillLoader = (): SkillLoader => {
  return createSkillLoader();
};
