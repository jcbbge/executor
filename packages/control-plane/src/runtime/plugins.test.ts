import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createPluginLoader } from "./plugins";

describe("plugins loader", () => {
  const loader = createPluginLoader();

  it("should list plugins from filesystem", async () => {
    const plugins = await Effect.runPromise(loader.list());
    expect(plugins.length).toBeGreaterThan(0);
    expect(plugins[0]).toHaveProperty("name");
  });

  it("should load scratchpad plugin", async () => {
    const plugin = await Effect.runPromise(loader.load("scratchpad"));
    expect(plugin.name).toBe("scratchpad");
    expect(plugin.content).toContain("Scratchpad");
    // metadata.name comes from YAML frontmatter if present
  });

  it("should detect existing plugins", async () => {
    const exists = await Effect.runPromise(loader.exists("scratchpad"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing plugins", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });
});
