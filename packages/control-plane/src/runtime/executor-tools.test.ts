import { describe, it, expect } from "vitest";
import { createExecutorToolMap } from "./executor-tools";
import * as Effect from "effect/Effect";
import { createSkillLoader } from "./skills";
import { createRuleLoader } from "./rules";

// Mock source auth service for testing
const mockSourceAuthService = {
  addExecutorSource: () => Promise.resolve({ kind: "connected", source: { id: "test" } }),
  getSourceById: () => Promise.resolve({ id: "test" }),
  getLocalServerBaseUrl: () => "http://localhost:8080",
} as any;

describe("executor tool map", () => {
  const toolMap = createExecutorToolMap({
    workspaceId: "test-workspace" as any,
    sourceAuthService: mockSourceAuthService,
  });

  it("should have executor.sources.add tool", () => {
    expect(toolMap).toHaveProperty("executor.sources.add");
  });

  it("should have executor.skill.load tool", () => {
    expect(toolMap).toHaveProperty("executor.skill.load");
  });

  it("should have executor.skill.list tool", () => {
    expect(toolMap).toHaveProperty("executor.skill.list");
  });

  it("should have executor.rule.load tool", () => {
    expect(toolMap).toHaveProperty("executor.rule.load");
  });

  it("should have executor.rule.list tool", () => {
    expect(toolMap).toHaveProperty("executor.rule.list");
  });
});

describe("skills integration", () => {
  it("should load skills through loader directly", async () => {
    const loader = createSkillLoader();
    const skill = await Effect.runPromise(loader.load("starting-session"));
    expect(skill.name).toBe("starting-session");
    expect(skill.content).toContain("Starting Session");
  });

  it("should list skills through loader directly", async () => {
    const loader = createSkillLoader();
    const skills = await Effect.runPromise(loader.list());
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]).toHaveProperty("name");
  });
});

describe("rules integration", () => {
  it("should load rules through loader directly", async () => {
    const loader = createRuleLoader();
    const rule = await Effect.runPromise(loader.load("solidjs"));
    expect(rule.name).toBe("solidjs");
    expect(rule.content).toContain("SolidJS");
    expect(rule.metadata.globs).toBeDefined();
  });

  it("should list rules through loader directly", async () => {
    const loader = createRuleLoader();
    const rules = await Effect.runPromise(loader.list());
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveProperty("name");
    expect(rules[0]).toHaveProperty("description");
  });
});
