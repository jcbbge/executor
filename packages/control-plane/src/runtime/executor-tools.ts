import {
  type ElicitationResponse,
  type OnElicitation,
  type ToolInvocationContext,
  type ToolMetadata,
  toTool,
  type ToolMap,
  type ToolPath,
} from "@executor/codemode-core";
import {
  ExecutionIdSchema,
  ExecutionInteractionIdSchema,
  SourceSchema,
  type Source,
  type WorkspaceId,
} from "#schema";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

/** Run an Effect as a Promise, preserving the original error (not FiberFailure). */
const runEffect = async <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

import {
  type ExecutorAddSourceInput,
  type ExecutorHttpSourceAuthInput,
  type RuntimeSourceAuthService,
} from "./source-auth-service";
import {
  deriveSchemaJson,
  deriveSchemaTypeSignature,
} from "./schema-type-signature";
import { createRuleLoader } from "./rules.js";
import { createSkillLoader } from "./skills.js";
import { createSubagentLoader } from "./subagents.js";
import { createCommandLoader } from "./commands.js";
import { createHookLoader } from "./hooks.js";
import { createIntegrationLoader } from "./integrations.js";
import { createPluginLoader } from "./plugins.js";
import { createAgentFileLoader } from "./agent-file.js";
import { createPrimitivesService, ALL_PRIMITIVE_TYPES } from "./primitives.js";
import { decodeSourceCredentialSelectionContent } from "./source-credential-interactions.js";

// Rule tool schemas
const RuleLoadInputSchema = Schema.Struct({
  name: Schema.String,
});

const RuleListInputSchema = Schema.Struct({});

const RuleMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  globs: Schema.optional(Schema.Array(Schema.String)),
});

const RuleOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: RuleMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});

const RuleListOutputSchema = Schema.Array(RuleMetadataSchema);

// Skill tool schemas
const SkillLoadInputSchema = Schema.Struct({
  name: Schema.String,
});

const SkillListInputSchema = Schema.Struct({});

const SkillMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
});

const SkillOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: SkillMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});

const SkillListOutputSchema = Schema.Array(SkillMetadataSchema);

const SkillExecuteInputSchema = Schema.Struct({
  name: Schema.String,
  context: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

const SkillExecuteOutputSchema = Schema.Struct({
  result: Schema.String,
});

// Subagent tool schemas
const SubagentLoadInputSchema = Schema.Struct({
  name: Schema.String,
});

const SubagentListInputSchema = Schema.Struct({});

const SubagentMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  tools: Schema.optional(Schema.Array(Schema.String)),
  temperature: Schema.optional(Schema.Number),
});

const SubagentOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: SubagentMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});

const SubagentListOutputSchema = Schema.Array(SubagentMetadataSchema);

const SubagentDelegateInputSchema = Schema.Struct({
  name: Schema.String,
  input: Schema.String,
});

const SubagentDelegateOutputSchema = Schema.Struct({
  result: Schema.String,
});

// Command tool schemas
const CommandLoadInputSchema = Schema.Struct({ name: Schema.String });
const CommandListInputSchema = Schema.Struct({});
const CommandMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
});
const CommandOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: CommandMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});
const CommandListOutputSchema = Schema.Array(CommandMetadataSchema);

const CommandRunInputSchema = Schema.Struct({
  name: Schema.String,
  args: Schema.optional(Schema.Array(Schema.String)),
  context: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

const CommandRunOutputSchema = Schema.Struct({
  result: Schema.String,
});

// Hook tool schemas
const HookLoadInputSchema = Schema.Struct({ name: Schema.String });
const HookListInputSchema = Schema.Struct({});
const HookMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  shebang: Schema.optional(Schema.String),
});
const HookOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: HookMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});
const HookListOutputSchema = Schema.Array(HookMetadataSchema);

// Integration tool schemas
const IntegrationLoadInputSchema = Schema.Struct({ name: Schema.String });
const IntegrationListInputSchema = Schema.Struct({});
const IntegrationMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
});
const IntegrationOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: IntegrationMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});
const IntegrationListOutputSchema = Schema.Array(IntegrationMetadataSchema);

// Plugin tool schemas
const PluginLoadInputSchema = Schema.Struct({ name: Schema.String });
const PluginListInputSchema = Schema.Struct({});
const PluginMetadataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  disableModelInvocation: Schema.optional(Schema.Boolean),
});
const PluginOutputSchema = Schema.Struct({
  name: Schema.String,
  metadata: PluginMetadataSchema,
  content: Schema.String,
  path: Schema.String,
});
const PluginListOutputSchema = Schema.Array(PluginMetadataSchema);

// Agent file tool schema (single file, no list)
const AgentFileLoadInputSchema = Schema.Struct({});
const AgentFileOutputSchema = Schema.Struct({
  name: Schema.String,
  content: Schema.String,
  path: Schema.String,
});

// Primitives discovery schemas
const PrimitivesDiscoverInputSchema = Schema.Struct({});
const PrimitivesDiscoverOutputSchema = Schema.Any;

const PrimitivesGetByTypeInputSchema = Schema.Struct({
  type: Schema.String,
});
const PrimitivesGetByTypeOutputSchema = Schema.Any;

const PrimitivesGetInputSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
});
const PrimitivesGetOutputSchema = Schema.Any;

const PrimitivesHelpInputSchema = Schema.Struct({});
const PrimitivesHelpOutputSchema = Schema.Any;




const ExecutorMcpSourceAddInputSchema = Schema.Struct({
  kind: Schema.optional(Schema.Literal("mcp")),
  endpoint: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  namespace: Schema.optional(Schema.NullOr(Schema.String)),
});

const ExecutorOpenApiSourceAddInputSchema = Schema.Struct({
  kind: Schema.Literal("openapi"),
  endpoint: Schema.String,
  specUrl: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  namespace: Schema.optional(Schema.NullOr(Schema.String)),
});

const ExecutorGraphqlSourceAddInputSchema = Schema.Struct({
  kind: Schema.Literal("graphql"),
  endpoint: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  namespace: Schema.optional(Schema.NullOr(Schema.String)),
});

const ExecutorSourcesAddSchema = Schema.Union(
  ExecutorMcpSourceAddInputSchema,
  ExecutorOpenApiSourceAddInputSchema,
  ExecutorGraphqlSourceAddInputSchema,
);

const ExecutorSourcesAddInputSchema = Schema.standardSchemaV1(
  ExecutorSourcesAddSchema,
);

const ExecutorSourcesAddOutputSchema = Schema.standardSchemaV1(SourceSchema);

export const EXECUTOR_SOURCES_ADD_MCP_INPUT_SIGNATURE = deriveSchemaTypeSignature(
  ExecutorMcpSourceAddInputSchema,
  240,
);

export const EXECUTOR_SOURCES_ADD_OPENAPI_INPUT_SIGNATURE = deriveSchemaTypeSignature(
  ExecutorOpenApiSourceAddInputSchema,
  420,
);

export const EXECUTOR_SOURCES_ADD_GRAPHQL_INPUT_SIGNATURE = deriveSchemaTypeSignature(
  ExecutorGraphqlSourceAddInputSchema,
  320,
);

export const EXECUTOR_SOURCES_ADD_INPUT_HINT = deriveSchemaTypeSignature(
  ExecutorSourcesAddInputSchema,
  320,
);

export const EXECUTOR_SOURCES_ADD_OUTPUT_SIGNATURE = deriveSchemaTypeSignature(
  SourceSchema,
  260,
);

export const EXECUTOR_SOURCES_ADD_INPUT_SCHEMA_JSON = JSON.stringify(
  deriveSchemaJson(ExecutorSourcesAddSchema) ?? {},
);

export const EXECUTOR_SOURCES_ADD_OUTPUT_SCHEMA_JSON = JSON.stringify(
  deriveSchemaJson(SourceSchema) ?? {},
);

export const EXECUTOR_SOURCES_ADD_HELP_LINES = [
  "Source add input shapes:",
  `- MCP: ${EXECUTOR_SOURCES_ADD_MCP_INPUT_SIGNATURE}`,
  '  Omit kind or set kind: "mcp". endpoint is the MCP server URL.',
  `- OpenAPI: ${EXECUTOR_SOURCES_ADD_OPENAPI_INPUT_SIGNATURE}`,
  "  endpoint is the base API URL. specUrl is the OpenAPI document URL.",
  `- GraphQL: ${EXECUTOR_SOURCES_ADD_GRAPHQL_INPUT_SIGNATURE}`,
  "  endpoint is the GraphQL HTTP endpoint.",
  "  executor handles the credential setup for you.",
] as const;

export const buildExecutorSourcesAddDescription = (): string =>
  [
    "Add an MCP, OpenAPI, or GraphQL source to the current workspace.",
    ...EXECUTOR_SOURCES_ADD_HELP_LINES,
  ].join("\n");

const toExecutionId = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Missing execution run id for executor.sources.add");
  }

  return ExecutionIdSchema.make(value);
};

const asToolPath = (value: string): ToolPath => value as ToolPath;

const trimOrNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveOpenApiSourceLabel = (input: {
  name?: string | null;
  endpoint: string;
}): string => trimOrNull(input.name) ?? input.endpoint;

const resolveLocalCredentialUrl = (input: {
  baseUrl: string;
  workspaceId: WorkspaceId;
  sourceId: Source["id"];
  executionId: string;
  interactionId: string;
}): string =>
  new URL(
    `/v1/workspaces/${encodeURIComponent(input.workspaceId)}/sources/${encodeURIComponent(input.sourceId)}/credentials?interactionId=${encodeURIComponent(`${input.executionId}:${input.interactionId}`)}`,
    input.baseUrl,
  ).toString();

const promptForSourceCredentialSelection = (input: {
  args: {
    workspaceId: WorkspaceId;
    sourceId: Source["id"];
    kind: "openapi" | "graphql";
    endpoint: string;
    specUrl?: string;
    name?: string | null;
    namespace?: string | null;
  };
  source: Source;
  executionId: string;
  interactionId: string;
  path: ToolPath;
  sourceKey: string;
  localServerBaseUrl: string | null;
  metadata?: ToolMetadata;
  invocation?: ToolInvocationContext;
  onElicitation?: OnElicitation;
}) =>
  Effect.gen(function* () {
    if (!input.onElicitation) {
      return yield* Effect.fail(
        new Error("executor.sources.add requires an elicitation-capable host"),
      );
    }

    if (input.localServerBaseUrl === null) {
      return yield* Effect.fail(
        new Error("executor.sources.add requires a local server base URL for credential capture"),
      );
    }

    const response: ElicitationResponse = yield* input.onElicitation({
      interactionId: input.interactionId,
      path: input.path,
      sourceKey: input.sourceKey,
      args: input.args,
      metadata: input.metadata,
      context: input.invocation,
      elicitation: {
        mode: "url",
        message: `Open the secure credential page to connect ${input.source.name}`,
        url: resolveLocalCredentialUrl({
          baseUrl: input.localServerBaseUrl,
          workspaceId: input.args.workspaceId,
          sourceId: input.args.sourceId,
          executionId: input.executionId,
          interactionId: input.interactionId,
        }),
        elicitationId: input.interactionId,
      },
    }).pipe(Effect.mapError((cause) => cause instanceof Error ? cause : new Error(String(cause))));

    if (response.action !== "accept") {
      return yield* Effect.fail(
        new Error(`Source credential setup was not completed for ${input.source.name}`),
      );
    }

    const content = yield* Effect.try({
      try: () => decodeSourceCredentialSelectionContent(response.content),
      catch: () =>
        new Error("Credential capture did not return a valid source auth choice for executor.sources.add"),
    });

    if (content.authKind === "none") {
      return { kind: "none" } satisfies ExecutorHttpSourceAuthInput;
    }

    return {
      kind: "bearer",
      tokenRef: content.tokenRef,
    } satisfies ExecutorHttpSourceAuthInput;
  });

export const createExecutorToolMap = (input: {
  workspaceId: WorkspaceId;
  sourceAuthService: RuntimeSourceAuthService;
}): ToolMap => ({
  "executor.sources.add": toTool({
    tool: {
      description: buildExecutorSourcesAddDescription(),
      inputSchema: ExecutorSourcesAddInputSchema,
      outputSchema: ExecutorSourcesAddOutputSchema,
      execute: async (
        args:
          | {
            kind?: "mcp";
            endpoint: string;
            name?: string | null;
            namespace?: string | null;
          }
          | {
            kind: "openapi";
            endpoint: string;
            specUrl: string;
            name?: string | null;
            namespace?: string | null;
          }
          | {
            kind: "graphql";
            endpoint: string;
            name?: string | null;
            namespace?: string | null;
          },
        context,
      ): Promise<Source> => {
        const executionId = toExecutionId(context?.invocation?.runId);
        const interactionId = ExecutionInteractionIdSchema.make(
          `executor.sources.add:${crypto.randomUUID()}`,
        );
        const preparedArgs: ExecutorAddSourceInput =
          args.kind === "openapi" || args.kind === "graphql"
            ? {
              ...args,
              workspaceId: input.workspaceId,
              executionId,
              interactionId,
            }
            : {
              kind: args.kind,
              endpoint: args.endpoint,
              name: args.name ?? null,
              namespace: args.namespace ?? null,
              workspaceId: input.workspaceId,
              executionId,
              interactionId,
            };
        const result = await runEffect(
          input.sourceAuthService.addExecutorSource(
            preparedArgs,
            context?.onElicitation
              ? {
                mcpDiscoveryElicitation: {
                  onElicitation: context.onElicitation,
                  path: context.path ?? asToolPath("executor.sources.add"),
                  sourceKey: context.sourceKey,
                  args,
                  metadata: context.metadata,
                  invocation: context.invocation,
                },
              }
              : undefined,
          ),
        );

        if (result.kind === "connected") {
          return result.source;
        }

        if (result.kind === "credential_required") {
          const preparedHttpArgs = preparedArgs as Extract<
            ExecutorAddSourceInput,
            { kind: "openapi" | "graphql" }
          >;
          const selectedAuth = await runEffect(
            promptForSourceCredentialSelection({
              args: {
                ...preparedHttpArgs,
                workspaceId: input.workspaceId,
                sourceId: result.source.id,
              },
              source: result.source,
              executionId,
              interactionId,
              path: context?.path ?? asToolPath("executor.sources.add"),
              sourceKey: context?.sourceKey ?? "executor",
              localServerBaseUrl: input.sourceAuthService.getLocalServerBaseUrl(),
              metadata: context?.metadata,
              invocation: context?.invocation,
              onElicitation: context?.onElicitation,
            }),
          );

          const completed = await runEffect(
            input.sourceAuthService.addExecutorSource(
              {
                ...preparedHttpArgs,
                auth: selectedAuth,
              },
              context?.onElicitation
                ? {
                  mcpDiscoveryElicitation: {
                    onElicitation: context.onElicitation,
                    path: context.path ?? asToolPath("executor.sources.add"),
                    sourceKey: context.sourceKey,
                    args,
                    metadata: context.metadata,
                    invocation: context.invocation,
                  },
                }
                : undefined,
            ),
          );

          if (completed.kind === "connected") {
            return completed.source;
          }

          throw new Error(`Source add was not completed for ${result.source.id}`);
        }

        if (!context?.onElicitation) {
          throw new Error("executor.sources.add requires an elicitation-capable host");
        }

        const response: ElicitationResponse = await runEffect(
          context.onElicitation({
            interactionId,
            path: context.path ?? asToolPath("executor.sources.add"),
            sourceKey: context.sourceKey,
            args: preparedArgs,
            metadata: context.metadata,
            context: context.invocation,
            elicitation: {
              mode: "url",
              message: `Open the provider sign-in page to connect ${result.source.name}`,
              url: result.authorizationUrl,
              elicitationId: result.sessionId,
            },
          }),
        );

        if (response.action !== "accept") {
          throw new Error(`Source add was not completed for ${result.source.id}`);
        }

        return await runEffect(
          input.sourceAuthService.getSourceById({
            workspaceId: input.workspaceId,
            sourceId: result.source.id,
          }),
        );
      },
    },
    metadata: {
      inputType: EXECUTOR_SOURCES_ADD_INPUT_HINT,
      outputType: EXECUTOR_SOURCES_ADD_OUTPUT_SIGNATURE,
      inputSchemaJson: EXECUTOR_SOURCES_ADD_INPUT_SCHEMA_JSON,
      outputSchemaJson: EXECUTOR_SOURCES_ADD_OUTPUT_SCHEMA_JSON,
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.skill.load": toTool({
    tool: {
      description: "Load a skill by name from the agent primitives schema. Returns the skill content (markdown after YAML frontmatter). Skills are read from AGENTS_SCHEMA_PATH/skills/ (defaults to ~/Documents/_agents/schema/skills/).",
      inputSchema: Schema.standardSchemaV1(SkillLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(SkillOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createSkillLoader();
        const skill = await runEffect(loader.load(args.name));
        return skill;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: SkillMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.skill.list": toTool({
    tool: {
      description: "List all available skills from the agent primitives schema. Returns metadata for each skill without full content.",
      inputSchema: Schema.standardSchemaV1(SkillListInputSchema),
      outputSchema: Schema.standardSchemaV1(SkillListOutputSchema),
      execute: async () => {
        const loader = createSkillLoader();
        const skills = await runEffect(loader.list());
        return skills;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string; version?: string; license?: string }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.skill.execute": toTool({
    tool: {
      description: "Execute a skill by name. Creates an ephemeral subagent session with the skill's content as system prompt, delegates the context/input to it, then destroys the session. Returns the subagent's response. Requires subagent-mcp (port 3096) to be running. Optional model override via SKILL_EXECUTE_MODEL env var (default: anthropic/claude-sonnet-4-6 via openrouter).",
      inputSchema: Schema.standardSchemaV1(SkillExecuteInputSchema),
      outputSchema: Schema.standardSchemaV1(SkillExecuteOutputSchema),
      execute: async (args: { name: string; context?: string; model?: string }) => {
        const skillLoader = createSkillLoader();
        const skill = await runEffect(skillLoader.load(args.name));
        const subagentLoader = createSubagentLoader();
        const result = await runEffect(
          subagentLoader.executeWithSystemPrompt({
            systemPrompt: skill.content,
            context: args.context ?? `Execute the ${args.name} skill.`,
            model: args.model,
          }),
        );
        return { result };
      },
    },
    metadata: {
      inputType: "{ name: string; context?: string; model?: string }",
      outputType: "{ result: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.rule.load": toTool({
    tool: {
      description: "Load a rule by name from the agent primitives schema. Returns the rule content (markdown after YAML frontmatter) and metadata including applicable file globs. Rules are read from AGENTS_SCHEMA_PATH/rules/ (defaults to ~/Documents/_agents/schema/rules/).",
      inputSchema: Schema.standardSchemaV1(RuleLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(RuleOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createRuleLoader();
        const rule = await runEffect(loader.load(args.name));
        return rule;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: RuleMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.rule.list": toTool({
    tool: {
      description: "List all available rules from the agent primitives schema. Returns metadata for each rule without full content.",
      inputSchema: Schema.standardSchemaV1(RuleListInputSchema),
      outputSchema: Schema.standardSchemaV1(RuleListOutputSchema),
      execute: async () => {
        const loader = createRuleLoader();
        const rules = await runEffect(loader.list());
        return rules;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string; globs?: string[] }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.subagent.load": toTool({
    tool: {
      description: "Load a subagent definition by name from the agent primitives schema. Returns the subagent content (system prompt after YAML frontmatter) and metadata. Subagents are read from AGENTS_SCHEMA_PATH/subagents/ (defaults to ~/Documents/_agents/schema/subagents/).",
      inputSchema: Schema.standardSchemaV1(SubagentLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(SubagentOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createSubagentLoader();
        const subagent = await runEffect(loader.load(args.name));
        return subagent;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: SubagentMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.subagent.list": toTool({
    tool: {
      description: "List all available subagents from the agent primitives schema. Returns metadata for each subagent without full content.",
      inputSchema: Schema.standardSchemaV1(SubagentListInputSchema),
      outputSchema: Schema.standardSchemaV1(SubagentListOutputSchema),
      execute: async () => {
        const loader = createSubagentLoader();
        const subagents = await runEffect(loader.list());
        return subagents;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string; provider?: string; model?: string; tools?: string[]; temperature?: number }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.subagent.delegate": toTool({
    tool: {
      description: "Delegate a task to a subagent via the subagent-mcp server (port 3096). The subagent will process the input and return a result. Requires subagent-mcp to be running.",
      inputSchema: Schema.standardSchemaV1(SubagentDelegateInputSchema),
      outputSchema: Schema.standardSchemaV1(SubagentDelegateOutputSchema),
      execute: async (args: { name: string; input: string }) => {
        const loader = createSubagentLoader();
        const result = await runEffect(loader.delegate({ name: args.name, input: args.input }));
        return { result };
      },
    },
    metadata: {
      inputType: "{ name: string; input: string }",
      outputType: "{ result: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Commands
  "executor.command.load": toTool({
    tool: {
      description: "Load a command by name from the agent primitives schema. Commands are read from AGENTS_SCHEMA_PATH/commands/ (defaults to ~/Documents/_agents/schema/commands/).",
      inputSchema: Schema.standardSchemaV1(CommandLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(CommandOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createCommandLoader();
        const command = await runEffect(loader.load(args.name));
        return command;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: CommandMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.command.list": toTool({
    tool: {
      description: "List all available commands from the agent primitives schema.",
      inputSchema: Schema.standardSchemaV1(CommandListInputSchema),
      outputSchema: Schema.standardSchemaV1(CommandListOutputSchema),
      execute: async () => {
        const loader = createCommandLoader();
        const commands = await runEffect(loader.list());
        return commands;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.command.run": toTool({
    tool: {
      description: "Run a command by name. Loads the command definition, creates an ephemeral subagent session with the command content as system prompt, delegates the args/context to it, then destroys the session. Returns the subagent's response. Requires subagent-mcp (port 3096) to be running.",
      inputSchema: Schema.standardSchemaV1(CommandRunInputSchema),
      outputSchema: Schema.standardSchemaV1(CommandRunOutputSchema),
      execute: async (args: { name: string; args?: string[]; context?: string; model?: string }) => {
        const commandLoader = createCommandLoader();
        const command = await runEffect(commandLoader.load(args.name));
        const subagentLoader = createSubagentLoader();
        const inputText = args.context
          ? args.context
          : args.args?.length
            ? `Run /${args.name} with args: ${args.args.join(" ")}`
            : `Run the /${args.name} command.`;
        const result = await runEffect(
          subagentLoader.executeWithSystemPrompt({
            systemPrompt: command.content,
            context: inputText,
            model: args.model,
          }),
        );
        return { result };
      },
    },
    metadata: {
      inputType: "{ name: string; args?: string[]; context?: string; model?: string }",
      outputType: "{ result: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Hooks
  "executor.hook.load": toTool({
    tool: {
      description: "Load a hook by name from the agent primitives schema. Hooks are shell scripts (.sh) read from AGENTS_SCHEMA_PATH/hooks/.",
      inputSchema: Schema.standardSchemaV1(HookLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(HookOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createHookLoader();
        const hook = await runEffect(loader.load(args.name));
        return hook;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: HookMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.hook.list": toTool({
    tool: {
      description: "List all available hooks from the agent primitives schema.",
      inputSchema: Schema.standardSchemaV1(HookListInputSchema),
      outputSchema: Schema.standardSchemaV1(HookListOutputSchema),
      execute: async () => {
        const loader = createHookLoader();
        const hooks = await runEffect(loader.list());
        return hooks;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string; shebang?: string }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Integrations
  "executor.integration.load": toTool({
    tool: {
      description: "Load an integration by name from the agent primitives schema. Integrations are read from AGENTS_SCHEMA_PATH/integrations/.",
      inputSchema: Schema.standardSchemaV1(IntegrationLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(IntegrationOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createIntegrationLoader();
        const integration = await runEffect(loader.load(args.name));
        return integration;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: IntegrationMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.integration.list": toTool({
    tool: {
      description: "List all available integrations from the agent primitives schema.",
      inputSchema: Schema.standardSchemaV1(IntegrationListInputSchema),
      outputSchema: Schema.standardSchemaV1(IntegrationListOutputSchema),
      execute: async () => {
        const loader = createIntegrationLoader();
        const integrations = await runEffect(loader.list());
        return integrations;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Plugins
  "executor.plugin.load": toTool({
    tool: {
      description: "Load a plugin by name from the agent primitives schema. Plugins are read from AGENTS_SCHEMA_PATH/plugins/.",
      inputSchema: Schema.standardSchemaV1(PluginLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(PluginOutputSchema),
      execute: async (args: { name: string }) => {
        const loader = createPluginLoader();
        const plugin = await runEffect(loader.load(args.name));
        return plugin;
      },
    },
    metadata: {
      inputType: "{ name: string }",
      outputType: "{ name: string; metadata: PluginMetadata; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.plugin.list": toTool({
    tool: {
      description: "List all available plugins from the agent primitives schema.",
      inputSchema: Schema.standardSchemaV1(PluginListInputSchema),
      outputSchema: Schema.standardSchemaV1(PluginListOutputSchema),
      execute: async () => {
        const loader = createPluginLoader();
        const plugins = await runEffect(loader.list());
        return plugins;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "Array<{ name: string; description?: string; disableModelInvocation?: boolean }>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Agent File (single file)
  "executor.agentFile.load": toTool({
    tool: {
      description: "Load the AGENTS.md file from the agent primitives schema. This is the source of truth for agent identity and rules.",
      inputSchema: Schema.standardSchemaV1(AgentFileLoadInputSchema),
      outputSchema: Schema.standardSchemaV1(AgentFileOutputSchema),
      execute: async () => {
        const loader = createAgentFileLoader();
        const agentFile = await runEffect(loader.load());
        return agentFile;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "{ name: string; content: string; path: string }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Unified Primitives Discovery
  "executor.primitives.discover": toTool({
    tool: {
      description: "Discover all available primitives (skills, rules, subagents, commands, hooks, integrations, plugins, agent-file, mcp) from the agent primitives schema. Returns comprehensive metadata about all primitives grouped by type, plus aggregate counts. Use this to introspect what's available before using specific primitives.",
      inputSchema: Schema.standardSchemaV1(PrimitivesDiscoverInputSchema),
      outputSchema: Schema.standardSchemaV1(PrimitivesDiscoverOutputSchema),
      execute: async () => {
        const service = createPrimitivesService();
        const result = await runEffect(service.discover());
        return result;
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "{ byType: Record<PrimitiveType, PrimitiveMetadata[]>, all: PrimitiveMetadata[], count: number, countByType: Record<PrimitiveType, number> }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.primitives.getByType": toTool({
    tool: {
      description: "Get all primitives of a specific type. Valid types: skill, rule, subagent, command, hook, integration, plugin, agent-file, mcp. Returns metadata for each primitive of that type.",
      inputSchema: Schema.standardSchemaV1(PrimitivesGetByTypeInputSchema),
      outputSchema: Schema.standardSchemaV1(PrimitivesGetByTypeOutputSchema),
      execute: async (args: { type: string }) => {
        const service = createPrimitivesService();
        const result = await runEffect(service.getByType(args.type as any));
        return result;
      },
    },
    metadata: {
      inputType: "{ type: PrimitiveType }",
      outputType: "Array<PrimitiveMetadata>",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.primitives.get": toTool({
    tool: {
      description: "Get a specific primitive by name and type. Returns null if not found. Use this to check if a specific primitive exists before attempting to load it.",
      inputSchema: Schema.standardSchemaV1(PrimitivesGetInputSchema),
      outputSchema: Schema.standardSchemaV1(PrimitivesGetOutputSchema),
      execute: async (args: { name: string; type: string }) => {
        const service = createPrimitivesService();
        const result = await runEffect(service.get(args.name, args.type as any));
        return result;
      },
    },
    metadata: {
      inputType: "{ name: string; type: PrimitiveType }",
      outputType: "PrimitiveMetadata | null",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  "executor.primitives.help": toTool({
    tool: {
      description: "Get comprehensive help documentation for using executor primitives. Designed specifically for AI assistants — includes quick start guide, detailed usage for each primitive type, common patterns, configuration options, and troubleshooting. Use this when you need to understand how to effectively use the executor primitives system.",
      inputSchema: Schema.standardSchemaV1(PrimitivesHelpInputSchema),
      outputSchema: Schema.standardSchemaV1(PrimitivesHelpOutputSchema),
      execute: async () => {
        const service = createPrimitivesService();
        return service.help();
      },
    },
    metadata: {
      inputType: "{}",
      outputType: "{ quickStart: string; primitives: Record<PrimitiveType, {...}>; patterns: string[]; configuration: string; troubleshooting: string[] }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

  // Unified Bootstrap — returns identity + workspace + capability map in one call
  "executor.primitives.bootstrap": toTool({
    tool: {
      description: "Unified session bootstrap. Returns three layers simultaneously: (1) identity context from anima (memories, continuity), (2) workspace context from dev-brain (recent activity, todos, threads), (3) capability map from executor (all 9 primitive types indexed and ready). Call once at session start. Replaces separate anima_bootstrap + starting-session calls. Each layer degrades gracefully — if one fails, the others still return.",
      inputSchema: Schema.standardSchemaV1(Schema.Struct({ limit: Schema.optional(Schema.Number) })),
      outputSchema: Schema.standardSchemaV1(Schema.Unknown),
      execute: async (args: { limit?: number }) => {
        const callMcpTool = async (
          endpoint: string,
          toolName: string,
          toolArgs: Record<string, unknown>,
        ): Promise<unknown> => {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              params: { name: toolName, arguments: toolArgs },
              id: 1,
            }),
          });
          const json = await res.json() as { result?: { content?: Array<{ type: string; text?: string }> }; error?: unknown };
          if (json.error) throw new Error(JSON.stringify(json.error));
          const content = json.result?.content ?? [];
          const text = content.find((c: { type: string }) => c.type === "text")?.text ?? null;
          if (text) {
            try { return JSON.parse(text); } catch { return text; }
          }
          return json.result;
        };

        const [identity, workspace, capabilities] = await Promise.allSettled([
          callMcpTool("http://127.0.0.1:3098/mcp", "anima_bootstrap", {}),
          callMcpTool("http://127.0.0.1:3097/mcp", "get_recent_context", { limit: args.limit ?? 5 }),
          (async () => {
            const service = createPrimitivesService();
            return runEffect(service.discover());
          })(),
        ]);

        return {
          identity: identity.status === "fulfilled" ? identity.value : { error: String((identity as PromiseRejectedResult).reason) },
          workspace: workspace.status === "fulfilled" ? workspace.value : { error: String((workspace as PromiseRejectedResult).reason) },
          capabilities: capabilities.status === "fulfilled"
            ? {
                total: (capabilities.value as { all: unknown[] }).all.length,
                byType: Object.fromEntries(
                  Object.entries((capabilities.value as { byType: Record<string, unknown[]> }).byType).map(([k, v]) => [k, (v as unknown[]).length])
                ),
              }
            : { error: String((capabilities as PromiseRejectedResult).reason) },
        };
      },
    },
    metadata: {
      inputType: "{ limit?: number }",
      outputType: "{ identity: unknown; workspace: unknown; capabilities: { total: number; byType: Record<string, number> } }",
      sourceKey: "executor",
      interaction: "auto",
    },
  }),

});
