import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { createDiscoveryPrimitives } from "./discovery";
import { toTool } from "./tool-map";
import type {
  DiscoveryPrimitives,
  SearchProvider,
  ToolDirectory,
  ToolMap,
  ToolPath,
} from "./types";

const asToolPath = (value: string): ToolPath => value as ToolPath;

const catalogNamespacesInputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    limit: Schema.optional(Schema.Number),
  }),
);

const catalogNamespacesOutputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    namespaces: Schema.Array(
      Schema.Struct({
        namespace: Schema.String,
        toolCount: Schema.Number,
      }),
    ),
  }),
);

const catalogToolsInputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    namespace: Schema.optional(Schema.String),
    query: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
);

const catalogToolsOutputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    results: Schema.Array(
      Schema.Struct({
        path: Schema.String,
      }),
    ),
  }),
);

const describeToolInputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    path: Schema.String,
    includeSchemas: Schema.optional(Schema.Boolean),
  }),
);

const describeToolOutputSchema = Schema.standardSchemaV1(
  Schema.NullOr(Schema.Unknown),
);

const discoverInputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
    includeSchemas: Schema.optional(Schema.Boolean),
  }),
);

const discoverResultItemSchema = Schema.Struct({
  path: Schema.String,
  score: Schema.Number,
  description: Schema.optional(Schema.String),
  interaction: Schema.optional(Schema.String),
  inputHint: Schema.optional(Schema.String),
  outputHint: Schema.optional(Schema.String),
  inputSchemaJson: Schema.optional(Schema.String),
  outputSchemaJson: Schema.optional(Schema.String),
  refHintKeys: Schema.optional(Schema.Array(Schema.String)),
});

const discoverOutputSchema = Schema.standardSchemaV1(
  Schema.Struct({
    bestPath: Schema.NullOr(Schema.String),
    results: Schema.Array(discoverResultItemSchema),
    total: Schema.Number,
  }),
);

export type CreateSystemToolMapInput = {
  primitives?: DiscoveryPrimitives;
  directory?: ToolDirectory;
  search?: SearchProvider;
  sourceKey?: string;
};

export const createSystemToolMap = (
  input: CreateSystemToolMapInput = {},
): ToolMap => {
  const sourceKey = input.sourceKey ?? "system";
  const primitives = input.primitives
    ?? createDiscoveryPrimitives({
      directory: input.directory,
      search: input.search,
    });

  const tools: ToolMap = {};

  if (primitives.catalog) {
    tools["catalog.namespaces"] = toTool({
      tool: {
        description: "List available namespaces with tool counts",
        inputSchema: catalogNamespacesInputSchema,
        outputSchema: catalogNamespacesOutputSchema,
        execute: ({ limit }: { limit?: number }) =>
          Effect.runPromise(
            primitives.catalog!.namespaces({
              ...(limit !== undefined ? { limit } : {}),
            }),
          ),
      },
      metadata: {
        sourceKey,
        interaction: "auto",
      },
    });

    tools["catalog.tools"] = toTool({
      tool: {
        description: "List tool paths with optional namespace/query filters",
        inputSchema: catalogToolsInputSchema,
        outputSchema: catalogToolsOutputSchema,
        execute: (
          input: { namespace?: string; query?: string; limit?: number },
        ) =>
          Effect.runPromise(
            primitives.catalog!.tools({
              ...(input.namespace !== undefined ? { namespace: input.namespace } : {}),
              ...(input.query !== undefined ? { query: input.query } : {}),
              ...(input.limit !== undefined ? { limit: input.limit } : {}),
            }),
          ),
      },
      metadata: {
        sourceKey,
        interaction: "auto",
      },
    });
  }

  if (primitives.describe) {
    tools["describe.tool"] = toTool({
      tool: {
        description: "Get metadata and optional schemas for a tool path",
        inputSchema: describeToolInputSchema,
        outputSchema: describeToolOutputSchema,
        execute: ({ path, includeSchemas }: { path: string; includeSchemas?: boolean }) =>
          Effect.runPromise(
            primitives.describe!.tool({
              path: asToolPath(path),
              ...(includeSchemas !== undefined ? { includeSchemas } : {}),
            }),
          ),
      },
      metadata: {
        sourceKey,
        interaction: "auto",
      },
    });
  }

  if (primitives.discover) {
    tools.discover = toTool({
      tool: {
        description: "Search tools by intent and return ranked matches",
        inputSchema: discoverInputSchema,
        outputSchema: discoverOutputSchema,
        execute: (
          input: { query: string; limit?: number; includeSchemas?: boolean },
        ) =>
          Effect.runPromise(
            primitives.discover!.run({
              query: input.query,
              ...(input.limit !== undefined ? { limit: input.limit } : {}),
              ...(input.includeSchemas !== undefined
                ? { includeSchemas: input.includeSchemas }
                : {}),
            }),
          ),
      },
      metadata: {
        sourceKey,
        interaction: "auto",
      },
    });
  }

  return tools;
};

export type MergeToolMapsOptions = {
  conflictMode?: "throw" | "override";
};

export const mergeToolMaps = (
  maps: ReadonlyArray<ToolMap>,
  options: MergeToolMapsOptions = {},
): ToolMap => {
  const conflictMode = options.conflictMode ?? "throw";
  const merged: ToolMap = {};

  for (const map of maps) {
    for (const [path, tool] of Object.entries(map)) {
      if (conflictMode === "throw" && path in merged) {
        throw new Error(`Tool path conflict: ${path}`);
      }
      merged[path] = tool;
    }
  }

  return merged;
};
