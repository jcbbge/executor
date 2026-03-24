import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createHookLoader } from "./hooks";

describe("hooks loader", () => {
  const loader = createHookLoader();

  it("should list hooks from filesystem", async () => {
    const hooks = await Effect.runPromise(loader.list());
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks[0]).toHaveProperty("name");
    expect(hooks[0]).toHaveProperty("shebang");
  });

  it("should load chain hook", async () => {
    const hook = await Effect.runPromise(loader.load("chain"));
    expect(hook.name).toBe("chain");
    expect(hook.content).toContain("#!/bin/bash");
    expect(hook.metadata.shebang).toContain("bash");
  });

  it("should detect existing hooks", async () => {
    const exists = await Effect.runPromise(loader.exists("chain"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing hooks", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });
});
