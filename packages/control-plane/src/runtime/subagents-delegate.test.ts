import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createSubagentLoader } from "./subagents";

describe("subagent delegation", () => {
  const loader = createSubagentLoader();

  it("should delegate to architect subagent (requires subagent-mcp running)", async () => {
    // This test requires subagent-mcp to be running on port 3096
    // The delegation endpoint works but SSE response parsing needs refinement
    const result = await Effect.runPromise(
      loader.delegate({
        name: "architect",
        input: "What is your purpose?",
      })
    );

    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
