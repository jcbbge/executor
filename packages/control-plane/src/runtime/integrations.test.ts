import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createIntegrationLoader } from "./integrations";

describe("integrations loader", () => {
  const loader = createIntegrationLoader();

  it("should list integrations from filesystem", async () => {
    const integrations = await Effect.runPromise(loader.list());
    expect(integrations.length).toBeGreaterThan(0);
    expect(integrations[0]).toHaveProperty("name");
  });

  it("should load rtk integration", async () => {
    const integration = await Effect.runPromise(loader.load("rtk"));
    expect(integration.name).toBe("rtk");
    expect(integration.content).toContain("RTK");
  });

  it("should detect existing integrations", async () => {
    const exists = await Effect.runPromise(loader.exists("rtk"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing integrations", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });
});
