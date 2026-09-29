import { describe, expect, it, vi } from "vitest";
import { CommandParser } from "../src/parser.js";
import { CommandRegistry } from "../src/commands.js";
import { CommandService } from "../src/service.js";

describe("CommandService", () => {
  it("handles a valid command", async () => {
    const parser = new CommandParser();
    const registry = new CommandRegistry();

    registry.register({
      name: "ping",
      handler: (context) => ({
        content: `Pong! ${context.args.join(", ")}`
      })
    });

    const service = new CommandService(
      parser,
      registry
    );

    const result = await service.handle(
      "/ping hello world",
      {
        platform: "telegram",
        user: {
          id: "user-1",
          platform: "telegram",
          displayName: "Test User"
        }
      }
    );

    expect(result).toEqual({
      handled: true,
      response: {
        content: "Pong! hello, world"
      }
    });
  });

  it("does not handle regular text", async () => {
    const parser = new CommandParser();
    const registry = new CommandRegistry();

    const service = new CommandService(
      parser,
      registry
    );

    const result = await service.handle(
      "hello world",
      {
        platform: "telegram",
        user: {
          id: "user-1",
          platform: "telegram",
          displayName: "Test User"
        }
      }
    );

    expect(result).toEqual({
      handled: false,
      response: null
    });
  });

  it("does not handle an unknown command", async () => {
    const parser = new CommandParser();
    const registry = new CommandRegistry();

    const service = new CommandService(
      parser,
      registry
    );

    const result = await service.handle(
      "/unknown",
      {
        platform: "discord",
        user: {
          id: "user-1",
          platform: "discord",
          displayName: "Test User"
        }
      }
    );

    expect(result).toEqual({
      handled: false,
      response: null
    });
  });

  it("passes parsed arguments to the handler", async () => {
    const parser = new CommandParser();
    const registry = new CommandRegistry();

    const handler = vi.fn(() => ({
      content: "ok"
    }));

    registry.register({
      name: "test",
      handler
    });

    const service = new CommandService(
      parser,
      registry
    );

    await service.handle(
      "/test one two three",
      {
        platform: "telegram",
        user: {
          id: "user-1",
          platform: "telegram",
          displayName: "Test User"
        }
      }
    );

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["one", "two", "three"],
        rawText: "/test one two three"
      })
    );
  });
});