import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createCommandLoader } from "./commands";

describe("commands loader", () => {
  const loader = createCommandLoader();

  it("should list commands from filesystem", async () => {
    const commands = await Effect.runPromise(loader.list());
    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0]).toHaveProperty("name");
  });

  it("should load kota command", async () => {
    const command = await Effect.runPromise(loader.load("kota"));
    expect(command.name).toBe("kota");
    expect(command.content).toContain("KotaDB");
    expect(command.metadata.name).toBe("kota");
  });

  it("should detect existing commands", async () => {
    const exists = await Effect.runPromise(loader.exists("kota"));
    expect(exists).toBe(true);
  });

  it("should detect non-existing commands", async () => {
    const exists = await Effect.runPromise(loader.exists("definitely-not-real"));
    expect(exists).toBe(false);
  });
});
