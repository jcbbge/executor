import { z } from "zod/v4";

const T2_SERVICES = {
  kotadb: {
    name: "kotadb",
    port: 3099,
    daemon: "com.jcbbge.kotadb-app",
  },
  "subagent-mcp": {
    name: "subagent-mcp",
    port: 3096,
    daemon: "dev.brain.subagent-mcp",
  },
} as const;

type ServiceName = keyof typeof T2_SERVICES;

const serviceNameSchema = z.enum(["kotadb", "subagent-mcp"]);

const serviceStartInputSchema = {
  name: serviceNameSchema,
  wait_for_healthy: z.boolean().optional().default(false),
};

const serviceStopInputSchema = {
  name: serviceNameSchema,
};

const serviceStatusInputSchema = {
  name: serviceNameSchema,
};

type ServiceStatus = {
  running: boolean;
  healthy: boolean;
  port: number;
  pid?: number;
  error?: string;
};

const tcpHealthCheck = async (port: number, timeoutMs = 5000): Promise<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const socket = await import("node:net").then((m) => m.createConnection({ port }));

  const timeout = setTimeout(() => {
    socket.destroy();
    resolve(false);
  }, timeoutMs);

  socket.on("connect", () => {
    clearTimeout(timeout);
    socket.end();
    resolve(true);
  });

  socket.on("error", () => {
    clearTimeout(timeout);
    resolve(false);
  });

  return promise;
};

const getPidForPort = async (port: number): Promise<number | undefined> => {
  try {
    const proc = Bun.spawn(["lsof", "-ti", `:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const pid = parseInt(output.trim(), 10);
    return isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
};

const isDaemonRunning = async (daemon: string): Promise<boolean> => {
  try {
    const proc = Bun.spawn(["launchctl", "list", daemon], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
};

const startService = async (
  name: ServiceName,
  waitForHealthy: boolean,
): Promise<ServiceStatus> => {
  const service = T2_SERVICES[name];
  const existingPid = await getPidForPort(service.port);

  if (existingPid) {
    const healthy = await tcpHealthCheck(service.port);
    return {
      running: true,
      healthy,
      port: service.port,
      pid: existingPid,
    };
  }

  const wasRunning = await isDaemonRunning(service.daemon);

  const proc = Bun.spawn(["launchctl", "start", service.daemon], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return {
      running: false,
      healthy: false,
      port: service.port,
      error: `launchctl start failed: ${stderr || "unknown error"}`,
    };
  }

  if (waitForHealthy) {
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      const healthy = await tcpHealthCheck(service.port, 1000);
      if (healthy) {
        const pid = await getPidForPort(service.port);
        return {
          running: true,
          healthy: true,
          port: service.port,
          pid,
        };
      }
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }
  }

  const pid = await getPidForPort(service.port);
  const healthy = await tcpHealthCheck(service.port);

  return {
    running: pid !== undefined,
    healthy,
    port: service.port,
    pid: pid ?? undefined,
  };
};

const stopService = async (name: ServiceName): Promise<ServiceStatus> => {
  const service = T2_SERVICES[name];
  const pid = await getPidForPort(service.port);

  if (!pid) {
    return {
      running: false,
      healthy: false,
      port: service.port,
    };
  }

  const proc = Bun.spawn(["launchctl", "stop", service.daemon], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return {
      running: true,
      healthy: await tcpHealthCheck(service.port),
      port: service.port,
      pid,
      error: `launchctl stop failed: ${stderr || "unknown error"}`,
    };
  }

  let attempts = 0;
  const maxAttempts = 20;
  while (attempts < maxAttempts) {
    const stillRunning = await getPidForPort(service.port);
    if (!stillRunning) {
      return {
        running: false,
        healthy: false,
        port: service.port,
      };
    }
    await new Promise((r) => setTimeout(r, 250));
    attempts++;
  }

  return {
    running: true,
    healthy: await tcpHealthCheck(service.port),
    port: service.port,
    pid,
    error: "Service did not stop within timeout",
  };
};

const getServiceStatus = async (name: ServiceName): Promise<ServiceStatus> => {
  const service = T2_SERVICES[name];
  const [pid, healthy, daemonRunning] = await Promise.all([
    getPidForPort(service.port),
    tcpHealthCheck(service.port),
    isDaemonRunning(service.daemon),
  ]);

  return {
    running: pid !== undefined,
    healthy,
    port: service.port,
    pid: pid ?? undefined,
  };
};

const formatStatusResult = (status: ServiceStatus): string => {
  const lines = [
    `Running: ${status.running}`,
    `Healthy: ${status.healthy}`,
    `Port: ${status.port}`,
  ];
  if (status.pid) {
    lines.push(`PID: ${status.pid}`);
  }
  if (status.error) {
    lines.push(`Error: ${status.error}`);
  }
  return lines.join("\n");
};

export const createOrchestratorTools = () => ({
  serviceStart: {
    name: "orchestrator/service_start",
    config: {
      description: "Start a T2 service (kotadb or subagent-mcp) using launchctl",
      inputSchema: serviceStartInputSchema,
    },
    handler: async (input: { name: ServiceName; wait_for_healthy?: boolean }) => {
      const result = await startService(input.name, input.wait_for_healthy ?? false);
      return {
        content: [{ type: "text" as const, text: formatStatusResult(result) }],
        structuredContent: result as Record<string, unknown>,
        ...(result.error ? { isError: true } : {}),
      };
    },
  },

  serviceStop: {
    name: "orchestrator/service_stop",
    config: {
      description: "Stop a T2 service (kotadb or subagent-mcp) using launchctl",
      inputSchema: serviceStopInputSchema,
    },
    handler: async (input: { name: ServiceName }) => {
      const result = await stopService(input.name);
      return {
        content: [{ type: "text" as const, text: formatStatusResult(result) }],
        structuredContent: result as Record<string, unknown>,
        ...(result.error ? { isError: true } : {}),
      };
    },
  },

  serviceStatus: {
    name: "orchestrator/service_status",
    config: {
      description: "Check status of a T2 service (kotadb or subagent-mcp)",
      inputSchema: serviceStatusInputSchema,
    },
    handler: async (input: { name: ServiceName }) => {
      const result = await getServiceStatus(input.name);
      return {
        content: [{ type: "text" as const, text: formatStatusResult(result) }],
        structuredContent: result as Record<string, unknown>,
      };
    },
  },
});

export type OrchestratorTools = ReturnType<typeof createOrchestratorTools>;
