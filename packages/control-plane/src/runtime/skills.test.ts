import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createSkillLoader } from "./skills";

describe("skills loader", () => {
  const loader = createSkillLoader();

  it("should list skills from filesystem", async () => {
    const skills = await Effect.runPromise(loader.list());
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]).toHaveProperty("name");
    expect(skills[0]).toHaveProperty("description");
  });

  it("should load starting-session skill", async () => {
    const skill = await Effect.runPromise(loader.load("starting-session"));
    expect(skill.name).toBe("starting-session");
    expect(skill.content).toContain("Starting Session");
    expect(skill.metadata.name).toBe("starting-session");
    expect(skill.path).toContain("starting-session/SKILL.md");
  });

  it("should detect existing skills", async () => {
    const exists = await Effect.runPromise(loader.exists("starting-session"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing skills", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });

  it("should parse YAML frontmatter correctly", async () => {
    const skill = await Effect.runPromise(loader.load("starting-session"));
    expect(skill.metadata.description).toContain("session orientation");
    expect(skill.metadata.version).toBe("5.0");
    expect(skill.metadata.license).toBe("MIT");
  });
});
