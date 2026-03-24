import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createRuleLoader } from "./rules";

describe("rules loader", () => {
  const loader = createRuleLoader();

  it("should list rules from filesystem", async () => {
    const rules = await Effect.runPromise(loader.list());
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveProperty("name");
    expect(rules[0]).toHaveProperty("description");
  });

  it("should load solidjs rule", async () => {
    const rule = await Effect.runPromise(loader.load("solidjs"));
    expect(rule.name).toBe("solidjs");
    expect(rule.content).toContain("SolidJS");
    expect(rule.metadata.name).toBe("solidjs");
    expect(rule.path).toContain("solidjs.md");
  });

  it("should load git rule", async () => {
    const rule = await Effect.runPromise(loader.load("git"));
    expect(rule.name).toBe("git");
    expect(rule.content).toContain("git");
    expect(rule.metadata.globs).toBeDefined();
  });

  it("should detect existing rules", async () => {
    const exists = await Effect.runPromise(loader.exists("solidjs"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing rules", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });

  it("should parse YAML frontmatter with globs correctly", async () => {
    const rule = await Effect.runPromise(loader.load("solidjs"));
    expect(rule.metadata.description).toContain("SolidJS");
    expect(rule.metadata.globs).toBeDefined();
    expect(Array.isArray(rule.metadata.globs)).toBe(true);
    expect(rule.metadata.globs?.length).toBeGreaterThan(0);
    expect(rule.metadata.globs?.some(g => g.includes(".jsx"))).toBe(true);
  });

  it("should exclude README.md from listing", async () => {
    const rules = await Effect.runPromise(loader.list());
    const readmeRule = rules.find(r => r.name?.toLowerCase() === "readme");
    expect(readmeRule).toBeUndefined();
  });
});
