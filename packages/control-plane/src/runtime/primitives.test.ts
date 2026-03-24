import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { 
  discoverPrimitives, 
  getPrimitivesByType, 
  getPrimitive,
  getPrimitivesHelp,
  createPrimitivesService,
  ALL_PRIMITIVE_TYPES 
} from "./primitives";

describe("primitives discovery", () => {
  it("should discover all primitive types", async () => {
    const result = await Effect.runPromise(discoverPrimitives());
    
    // Verify structure
    expect(result.byType).toBeDefined();
    expect(result.all).toBeDefined();
    expect(result.count).toBeGreaterThanOrEqual(0);
    expect(result.countByType).toBeDefined();
    
    // Verify all types exist in result
    for (const type of ALL_PRIMITIVE_TYPES) {
      expect(result.byType[type]).toBeDefined();
      expect(Array.isArray(result.byType[type])).toBe(true);
      expect(result.countByType[type]).toBe(result.byType[type].length);
    }
  });

  it("should discover skills", async () => {
    const skills = await Effect.runPromise(getPrimitivesByType("skill"));
    
    expect(Array.isArray(skills)).toBe(true);
    
    if (skills.length > 0) {
      const skill = skills[0];
      expect(skill.type).toBe("skill");
      expect(skill.name).toBeDefined();
      expect(skill.path).toBeDefined();
    }
  });

  it("should discover rules", async () => {
    const rules = await Effect.runPromise(getPrimitivesByType("rule"));
    
    expect(Array.isArray(rules)).toBe(true);
    
    if (rules.length > 0) {
      const rule = rules[0];
      expect(rule.type).toBe("rule");
      expect(rule.name).toBeDefined();
    }
  });

  it("should discover subagents", async () => {
    const subagents = await Effect.runPromise(getPrimitivesByType("subagent"));
    
    expect(Array.isArray(subagents)).toBe(true);
    expect(subagents.length).toBeGreaterThan(0); // Should have architect, debugger, etc.
    
    const architect = subagents.find(s => s.name === "architect");
    if (architect) {
      expect(architect.type).toBe("subagent");
      expect(architect.description).toBeDefined();
    }
  });

  it("should get a specific primitive", async () => {
    const subagent = await Effect.runPromise(getPrimitive("architect", "subagent"));
    
    if (subagent) {
      expect(subagent.name).toBe("architect");
      expect(subagent.type).toBe("subagent");
    }
  });

  it("should return null for non-existent primitive", async () => {
    const result = await Effect.runPromise(getPrimitive("nonexistent", "skill"));
    expect(result).toBeNull();
  });
});

describe("primitives service", () => {
  it("should provide unified interface", async () => {
    const service = createPrimitivesService();
    
    expect(service.discover).toBeDefined();
    expect(service.getByType).toBeDefined();
    expect(service.get).toBeDefined();
    expect(service.help).toBeDefined();
    
    const result = await Effect.runPromise(service.discover());
    expect(result.all).toBeDefined();
  });
});

describe("primitives help", () => {
  it("should provide LLM-facing documentation", () => {
    const help = getPrimitivesHelp();
    
    expect(help.quickStart).toBeDefined();
    expect(help.primitives).toBeDefined();
    expect(help.patterns).toBeDefined();
    expect(help.configuration).toBeDefined();
    expect(help.troubleshooting).toBeDefined();
    
    // Verify all primitive types have help
    for (const type of ALL_PRIMITIVE_TYPES) {
      expect(help.primitives[type]).toBeDefined();
      expect(help.primitives[type].description).toBeDefined();
      expect(help.primitives[type].usage).toBeDefined();
      expect(help.primitives[type].example).toBeDefined();
    }
  });
});
