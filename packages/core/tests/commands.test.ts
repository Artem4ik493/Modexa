import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../src/commands.js";

describe("CommandRegistry", () => {
  it("registers and retrieves a command", () => {
    const registry = new CommandRegistry();

    const command = {
      name: "ping",
      description: "Check if Modexa is alive",
      handler: () => ({
        content: "Pong!"
      })
    };

    registry.register(command);

    expect(registry.get("ping")).toBe(command);
  });

  it("normalizes command names", () => {
    const registry = new CommandRegistry();

    const command = {
      name: "ping",
      handler: () => ({
        content: "Pong!"
      })
    };

    registry.register(command);

    expect(registry.get("PING")).toBe(command);
    expect(registry.get("Ping")).toBe(command);
  });

  it("registers aliases", () => {
    const registry = new CommandRegistry();

    const command = {
      name: "ping",
      aliases: ["p"],
      handler: () => ({
        content: "Pong!"
      })
    };

    registry.register(command);

    expect(registry.get("p")).toBe(command);
    expect(registry.get("P")).toBe(command);
  });

  it("returns null for an unknown command", async () => {
    const registry = new CommandRegistry();

    const result = await registry.execute("unknown", {
      platform: "telegram",
      user: {
        id: "user-1",
        platform: "telegram",
        displayName: "Test User"
      },
      args: [],
      rawText: "/unknown"
    });

    expect(result).toBeNull();
  });

  it("executes a registered command", async () => {
    const handler = vi.fn(() => ({
      content: "Pong!"
    }));

    const registry = new CommandRegistry();

    registry.register({
      name: "ping",
      handler
    });

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

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: "Pong!"
    });
  });

  it("does not duplicate aliases in command list", () => {
    const registry = new CommandRegistry();

    registry.register({
      name: "ping",
      aliases: ["p", "testping"],
      handler: () => ({
        content: "Pong!"
      })
    });

    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.name).toBe("ping");
  });
});