import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  CommunityService,
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

  it("executes ping in Russian by default", async () => {
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
      rawText: "/ping",
      execution: {
        type: "dm",
        platform: "telegram",
        correlationId: "test",
        user: {
          id: "user-1",
          displayName: "Test User"
        },
        capabilities: [
          "commands",
          "account.manage",
          "identity.link",
          "billing"
        ]
      }
    });

    expect(result).toEqual({
      content: "Понг!"
    });
  });

  it("toggles community mode from settings", async () => {
    const registry = new CommandRegistry();
    const communityService = new CommunityService();

    createBuiltinCommands(
      registry,
      communityService
    );

    const community =
      communityService.createCommunity({
        name: "Test Community"
      });

    const result = await registry.execute(
      "settings",
      {
        platform: "telegram",
        user: {
          id: "user-1",
          displayName: "Admin"
        },
        community,
        args: ["private"],
        rawText: "/settings private",
        execution: {
          type: "community",
          platform: "telegram",
          correlationId: "test",
          user: {
            id: "user-1",
            displayName: "Admin",
            createdAt: new Date(),
            updatedAt: new Date()
          },
          community,
          capabilities: [
            "commands",
            "community.manage"
          ]
        }
      }
    );

    expect(community.mode).toBe("private");
    expect(result?.content).toContain(
      "Режим: приватный"
    );
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
      rawText: "/help",
      execution: {
        type: "dm",
        platform: "telegram",
        correlationId: "test",
        user: {
          id: "user-1",
          displayName: "Test User"
        },
        capabilities: [
          "commands",
          "account.manage",
          "identity.link",
          "billing"
        ]
      }
    });

    const content = result?.content ?? "";

    expect(content).toContain(
      "Доступные команды:"
    );

    expect(content).toContain(
      "/ping — Проверить, что Modexa работает"
    );

    expect(content).toContain(
      "/help (/commands) — Показать список команд"
    );
  });
});