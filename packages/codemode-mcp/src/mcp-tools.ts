import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as PartitionedSemaphore from "effect/PartitionedSemaphore";

import {
  standardSchemaFromJsonSchema,
  toTool,
  type ElicitationRequest,
  type ElicitationResponse,
  type ToolExecutionContext,
  type ToolMap,
  type ToolPath,
  unknownInputSchema,
} from "@executor-v3/codemode-core";

import {
  createInteractionId,
  hasElicitationRequestHandler,
  isUrlElicitationRequiredError,
  readMcpElicitationRequest,
  readUnknownRecord,
  toMcpElicitationResponse,
} from "./mcp-elicitation-bridge";
import {
  extractMcpToolManifestFromListToolsResult,
  joinToolPath,
  type McpToolManifest,
  type McpToolManifestEntry,
} from "./mcp-manifest";

export type { McpToolManifest, McpToolManifestEntry };
export { extractMcpToolManifestFromListToolsResult };

export type McpClientLike = {
  listTools: () => Promise<unknown>;
  callTool: (input: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<unknown>;
};

export type McpConnection = {
  client: McpClientLike;
  close?: () => Promise<void>;
};

export type McpConnector = () => Promise<McpConnection>;

type McpDiscoveryStage = "connect" | "list_tools" | "call_tool";

export class McpToolsError extends Data.TaggedError("McpToolsError")<{
  stage: McpDiscoveryStage;
  message: string;
  details: string | null;
}> {}

const toDetails = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const inputSchemaFromManifest = (inputSchemaJson: string | undefined) => {
  if (!inputSchemaJson) {
    return unknownInputSchema;
  }

  try {
    return standardSchemaFromJsonSchema(JSON.parse(inputSchemaJson), {
      vendor: "mcp",
      fallback: unknownInputSchema,
    });
  } catch {
    return unknownInputSchema;
  }
};

const withConnection = async <A>(
  connect: McpConnector,
  run: (connection: McpConnection) => Promise<A>,
): Promise<A> => {
  const connection = await connect();

  try {
    return await run(connection);
  } finally {
    await connection.close?.().catch(() => undefined);
  }
};

const elicitationClientSemaphore = PartitionedSemaphore.makeUnsafe<McpClientLike>({
  permits: 1,
});

const withElicitationClientLock = <A>(
  client: McpClientLike,
  run: () => Promise<A>,
): Promise<A> =>
  Effect.runPromise(
    elicitationClientSemaphore.withPermits(client, 1)(
      Effect.tryPromise({
        try: run,
        catch: (cause) =>
          cause instanceof Error || cause instanceof McpToolsError
            ? cause
            : new Error(String(cause)),
      }),
    ),
  );

const resolveElicitationResponse = async (input: {
  toolName: string;
  onElicitation: NonNullable<ToolExecutionContext["onElicitation"]>;
  interactionId: string;
  path: ToolPath;
  sourceKey: string;
  args: Record<string, unknown>;
  executionContext?: ToolExecutionContext;
  elicitation: ElicitationRequest;
}): Promise<ElicitationResponse> => {
  try {
    return await Effect.runPromise(
      input.onElicitation({
        interactionId: input.interactionId,
        path: input.path,
        sourceKey: input.sourceKey,
        args: input.args,
        metadata: input.executionContext?.metadata,
        context: input.executionContext?.invocation,
        elicitation: input.elicitation,
      }),
    );
  } catch (cause) {
    throw new McpToolsError({
      stage: "call_tool",
      message: `Failed resolving elicitation for ${input.toolName}`,
      details: toDetails(cause),
    });
  }
};

const installMcpElicitationHandler = (input: {
  client: McpClientLike;
  toolName: string;
  onElicitation: NonNullable<ToolExecutionContext["onElicitation"]>;
  path: ToolPath;
  sourceKey: string;
  args: Record<string, unknown>;
  executionContext?: ToolExecutionContext;
}): void => {
  if (!hasElicitationRequestHandler(input.client)) {
    throw new McpToolsError({
      stage: "call_tool",
      message: `MCP client does not support elicitation callbacks for ${input.toolName}`,
      details: null,
    });
  }

  let sequence = 0;

  input.client.setRequestHandler(ElicitRequestSchema, async (request) => {
    const elicitation = readMcpElicitationRequest(request.params);
    sequence += 1;
    const interactionId = createInteractionId({
      path: input.path,
      invocation: input.executionContext?.invocation,
      elicitation,
      sequence,
    });

    try {
      const response = await resolveElicitationResponse({
        toolName: input.toolName,
        onElicitation: input.onElicitation,
        interactionId,
        path: input.path,
        sourceKey: input.sourceKey,
        args: input.args,
        executionContext: input.executionContext,
        elicitation,
      });

      return toMcpElicitationResponse(response);
    } catch {
      return { action: "cancel" as const };
    }
  });
};

const resolveUrlElicitations = async (input: {
  cause: {
    elicitations: ReadonlyArray<ElicitationRequest>;
  };
  toolName: string;
  onElicitation: NonNullable<ToolExecutionContext["onElicitation"]>;
  path: ToolPath;
  sourceKey: string;
  args: Record<string, unknown>;
  executionContext?: ToolExecutionContext;
}): Promise<void> => {
  for (const elicitation of input.cause.elicitations) {
    const interactionId = createInteractionId({
      path: input.path,
      invocation: input.executionContext?.invocation,
      elicitation,
    });

    const response = await resolveElicitationResponse({
      toolName: input.toolName,
      onElicitation: input.onElicitation,
      interactionId,
      path: input.path,
      sourceKey: input.sourceKey,
      args: input.args,
      executionContext: input.executionContext,
      elicitation,
    });

    if (response.action !== "accept") {
      throw new McpToolsError({
        stage: "call_tool",
        message: `URL elicitation was not accepted for ${input.toolName}`,
        details: response.action,
      });
    }
  }
};

export const createMcpConnectorFromClient = (
  client: McpClientLike,
): McpConnector =>
  async () => ({
    client,
    close: async () => undefined,
  });

export const createMcpToolsFromManifest = (input: {
  manifest: McpToolManifest;
  connect: McpConnector;
  namespace?: string;
  sourceKey?: string;
}): ToolMap => {
  const sourceKey = input.sourceKey ?? "mcp.generated";

  return Object.fromEntries(
    input.manifest.tools.map((entry) => {
      const path = joinToolPath(input.namespace, entry.toolId);

      return [
        path,
        toTool({
          tool: {
            description: entry.description ?? `MCP tool: ${entry.toolName}`,
            inputSchema: inputSchemaFromManifest(entry.inputSchemaJson),
            execute: async (
              args: unknown,
              executionContext?: ToolExecutionContext,
            ) =>
              withConnection(input.connect, async (connection) => {
                const payloadArgs = readUnknownRecord(args);

                const runCallFlow = async (): Promise<unknown> => {
                  const onElicitation = executionContext?.onElicitation;
                  if (onElicitation) {
                    installMcpElicitationHandler({
                      client: connection.client,
                      toolName: entry.toolName,
                      onElicitation,
                      path,
                      sourceKey,
                      args: payloadArgs,
                      executionContext,
                    });
                  }

                  const callTool = () =>
                    connection.client.callTool({
                      name: entry.toolName,
                      arguments: payloadArgs,
                    });

                  let retries = 0;
                  while (true) {
                    try {
                      return await callTool();
                    } catch (cause) {
                      if (
                        onElicitation
                        && isUrlElicitationRequiredError(cause)
                        && retries < 2
                      ) {
                        await resolveUrlElicitations({
                          cause,
                          toolName: entry.toolName,
                          onElicitation,
                          path,
                          sourceKey,
                          args: payloadArgs,
                          executionContext,
                        });

                        retries += 1;
                        continue;
                      }

                      throw new McpToolsError({
                        stage: "call_tool",
                        message: `Failed invoking MCP tool: ${entry.toolName}`,
                        details: toDetails(cause),
                      });
                    }
                  }
                };

                return executionContext?.onElicitation
                  ? withElicitationClientLock(connection.client, runCallFlow)
                  : runCallFlow();
              }),
          },
          metadata: {
            sourceKey,
            inputSchemaJson: entry.inputSchemaJson,
            outputSchemaJson: entry.outputSchemaJson,
          },
        }),
      ] as const;
    }),
  );
};

export const discoverMcpToolsFromConnector = (input: {
  connect: McpConnector;
  namespace?: string;
  sourceKey?: string;
}): Effect.Effect<{ manifest: McpToolManifest; tools: ToolMap }, McpToolsError> =>
  Effect.gen(function* () {
    const listed = yield* Effect.tryPromise({
      try: () =>
        withConnection(input.connect, async (connection) => {
          try {
            return await connection.client.listTools();
          } catch (cause) {
            throw new McpToolsError({
              stage: "list_tools",
              message: "Failed listing MCP tools",
              details: toDetails(cause),
            });
          }
        }),
      catch: (cause) =>
        cause instanceof McpToolsError
          ? cause
          : new McpToolsError({
              stage: "connect",
              message: "Failed connecting to MCP server",
              details: toDetails(cause),
            }),
    });

    const manifest = extractMcpToolManifestFromListToolsResult(listed);

    return {
      manifest,
      tools: createMcpToolsFromManifest({
        manifest,
        connect: input.connect,
        namespace: input.namespace,
        sourceKey: input.sourceKey,
      }),
    };
  });

export const discoverMcpToolsFromClient = (input: {
  client: McpClientLike;
  namespace?: string;
  sourceKey?: string;
}): Effect.Effect<{ manifest: McpToolManifest; tools: ToolMap }, McpToolsError> =>
  discoverMcpToolsFromConnector({
    connect: createMcpConnectorFromClient(input.client),
    namespace: input.namespace,
    sourceKey: input.sourceKey,
  });
