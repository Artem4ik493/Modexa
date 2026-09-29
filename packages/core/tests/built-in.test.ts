import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  createBuiltinCommands
} from "../src/index.js";

describe("built-in commands", () => {
  it("registers the ping command", () => {
    const registry = new CommandRegistry();

    createBuiltinCommands(registry);

    expect(registry.get("ping")).toBeDefined();
  });

  it("registers the help command", () => {
    const registry = new CommandRegistry();

    createBuiltinCommands(registry);

    expect(registry.get("help")).toBeDefined();
  });

  it("registers commands alias for help", () => {
    const registry = new CommandRegistry();

    createBuiltinCommands(registry);

    expect(registry.get("commands")).toBe(
      registry.get("help")
    );
  });

  it("executes ping", async () => {
    const registry = new CommandRegistry();

    createBuiltinCommands(registry);

    const result = await registry.execute("ping", {
      platform: "telegram",
      user: {
        id: "user-1",
        platform: "telegram",
        displayName: "Test User"
      },
      args: [],
      rawText: "/ping"
    });

    expect(result).toEqual({
      content: "Pong!"
    });
  });

  it("generates help from the command registry", async () => {
    const registry = new CommandRegistry();

    createBuiltinCommands(registry);

    const result = await registry.execute("help", {
      platform: "telegram",
      user: {
        id: "user-1",
        platform: "telegram",
        displayName: "Test User"
      },
      args: [],
      rawText: "/help"
    });

    expect(result).toEqual({
      content:
        "Available commands:\n" +
        "/ping — Check if Modexa is alive\n" +
        "/help (/commands) — Show available commands"
    });
  });
});