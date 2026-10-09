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

  it("registers a separate command catalog", () => {
    const registry = new CommandRegistry();

    createBuiltinCommands(registry);

    expect(registry.get("commands")).toBeDefined();
    expect(registry.get("commands")).not.toBe(registry.get("help"));
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

  it("returns the updated community mode in settings", async () => {
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

    const execution = {
      type: "community" as const,
      platform: "telegram" as const,
      correlationId: "test",
      user: {
        id: "user-1",
        displayName: "Admin",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      community,
      capabilities: [
        "commands" as const,
        "community.manage" as const
      ]
    };

    const result =
      await registry.execute(
        "settings",
        {
          platform: "telegram",
          user: execution.user,
          community,
          args: ["private"],
          rawText: "/settings private",
          execution
        }
      );

    expect(result?.content).toContain(
      "Режим: приватный"
    );
  });

  it("renders help as a knowledge-base guide rather than a command list", async () => {
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
    expect(content).toContain("Путеводитель по Modexa");
    expect(content).toContain("Выберите категорию");
    expect(content).not.toContain("/ping —");
    expect(result?.buttons?.some((button) => button.action.type === "command" && button.action.command === "/commands")).toBe(true);
  });

  it("opens a category with command rows and pagination metadata", async () => {
    const registry = new CommandRegistry();
    createBuiltinCommands(registry);

    const result = await registry.execute("help", {
      platform: "telegram",
      user: {
        id: "user-1",
        platform: "telegram",
        displayName: "Test User"
      },
      args: ["category", "information"],
      rawText: "/help category information",
      execution: {
        type: "dm",
        platform: "telegram",
        correlationId: "test",
        user: {
          id: "user-1",
          displayName: "Test User"
        },
        capabilities: ["commands", "account.manage", "identity.link", "billing"]
      }
    });

    expect(result?.content).toContain("Информация");
    expect(result?.content).toContain("/ping");
    expect(result?.buttons?.some((button) =>
      button.action.type === "command" &&
      button.action.command === "/help" &&
      button.action.args?.[0] === "command" &&
      button.action.args?.[1] === "ping"
    )).toBe(true);
  });

  it("opens detailed help for a specific command", async () => {
    const registry = new CommandRegistry();
    createBuiltinCommands(registry);

    const result = await registry.execute("help", {
      platform: "telegram",
      user: {
        id: "user-1",
        platform: "telegram",
        displayName: "Test User"
      },
      args: ["command", "ping"],
      rawText: "/help command ping",
      execution: {
        type: "dm",
        platform: "telegram",
        correlationId: "test",
        user: {
          id: "user-1",
          displayName: "Test User"
        },
        capabilities: ["commands", "account.manage", "identity.link", "billing"]
      }
    });

    expect(result?.content).toContain("Команда /ping");
    expect(result?.content).toContain("Использование");
    expect(result?.content).toContain("/ping");
    expect(result?.buttons?.some((button) => button.label === "Информация")).toBe(true);
  });

  it("renders a separate catalog in /commands", async () => {
    const registry = new CommandRegistry();
    createBuiltinCommands(registry);

    const result = await registry.execute("commands", {
      platform: "telegram",
      user: {
        id: "user-1",
        platform: "telegram",
        displayName: "Test User"
      },
      args: [],
      rawText: "/commands",
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

    expect(result?.content).toContain("/ping");
    expect(result?.content).toContain("Общие функции");
    expect(result?.content).not.toContain("/commands —");
  });
});