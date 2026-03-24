import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createAgentFileLoader } from "./agent-file";

describe("agent-file loader", () => {
  const loader = createAgentFileLoader();

  it("should load AGENTS.md file", async () => {
    const agentFile = await Effect.runPromise(loader.load());
    expect(agentFile.name).toBe("AGENTS");
    expect(agentFile.content).toContain("Session Start");
    expect(agentFile.path).toContain("AGENTS.md");
  });
});
