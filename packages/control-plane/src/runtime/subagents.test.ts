import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createSubagentLoader } from "./subagents";

describe("subagents loader", () => {
  const loader = createSubagentLoader();

  it("should list subagents from filesystem", async () => {
    const subagents = await Effect.runPromise(loader.list());
    expect(subagents.length).toBeGreaterThan(0);
    expect(subagents[0]).toHaveProperty("name");
    expect(subagents[0]).toHaveProperty("description");
  });

  it("should load architect subagent", async () => {
    const subagent = await Effect.runPromise(loader.load("architect"));
    expect(subagent.name).toBe("architect");
    expect(subagent.content).toContain("software architect");
    expect(subagent.metadata.model).toBe("minimax-m2.5-free");
    expect(subagent.metadata.tools).toContain("read");
    expect(subagent.path).toContain("architect.md");
  });

  it("should load reviewer subagent", async () => {
    const subagent = await Effect.runPromise(loader.load("reviewer"));
    expect(subagent.name).toBe("reviewer");
    expect(subagent.metadata.description).toBeDefined();
  });

  it("should detect existing subagents", async () => {
    const exists = await Effect.runPromise(loader.exists("architect"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing subagents", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });

  it("should parse YAML frontmatter with tools array correctly", async () => {
    const subagent = await Effect.runPromise(loader.load("architect"));
    expect(subagent.metadata.tools).toBeDefined();
    expect(Array.isArray(subagent.metadata.tools)).toBe(true);
    expect(subagent.metadata.tools?.length).toBeGreaterThan(0);
    expect(subagent.metadata.tools).toContain("read");
    expect(subagent.metadata.tools).toContain("grep");
  });

  it("should exclude README.md and AGENTS.md from listing", async () => {
    const subagents = await Effect.runPromise(loader.list());
    const readmeSubagent = subagents.find(s => s.name?.toLowerCase() === "readme");
    const agentsSubagent = subagents.find(s => s.name?.toLowerCase() === "agents");
    expect(readmeSubagent).toBeUndefined();
    expect(agentsSubagent).toBeUndefined();
  });
});
