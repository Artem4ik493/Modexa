import { describe, expect, it } from "vitest";

import {
  CommandParser,
  CommandRegistry,
  CommandService
} from "../src/index.js";

import type {
  ExecutionContext
} from "../src/contexts/types.js";

describe("CommandService", () => {
  function createExecutionContext(): ExecutionContext {
    return {
      type: "dm",
      platform: "telegram",
      correlationId: "test-correlation-id",
      user: {
        id: "user-1",
        displayName: "Test User",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      capabilities: [
        "commands",
        "account.manage",
        "identity.link",
        "billing"
      ]
    };
  }

  function createService(
    registry: CommandRegistry
  ): CommandService {
    return new CommandService(
      new CommandParser(),
      registry
    );
  }

  it("handles a valid command", async () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "ping",
      handler: () => ({
        content: "pong"
      })
    });

    const service =
      createService(registry);

    const execution =
      createExecutionContext();

    const result =
      await service.handle(
        "/ping",
        {
          platform: execution.platform,
          user: execution.user,
          community: execution.community,
          channel: execution.channel
        },
        execution
      );

    expect(result).toEqual({
      handled: true,
      response: {
        content: "pong"
      }
    });
  });

  it("does not handle regular text", async () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "ping",
      handler: () => ({
        content: "pong"
      })
    });

    const service =
      createService(registry);

    const execution =
      createExecutionContext();

    const result =
      await service.handle(
        "hello",
        {
          platform: execution.platform,
          user: execution.user,
          community: execution.community,
          channel: execution.channel
        },
        execution
      );

    expect(result).toEqual({
      handled: false,
      response: null
    });
  });

  it("returns a not-found response for an unknown command", async () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "ping",
      handler: () => ({
        content: "pong"
      })
    });

    const service =
      createService(registry);

    const execution =
      createExecutionContext();

    const result =
      await service.handle(
        "/unknown",
        {
          platform: execution.platform,
          user: execution.user,
          community: execution.community,
          channel: execution.channel
        },
        execution
      );

    expect(result).toEqual({
      handled: true,
      response: {
        content:
          "Команда не найдена. Для просмотра доступных команд для вашей роли user используйте /help."
      }
    });
  });

  it("denies a command when a required capability is missing", async () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "admin-only",
      requiredCapabilities: [
        "community.manage"
      ],
      handler: () => ({
        content: "secret"
      })
    });

    const service =
      createService(registry);

    const execution: ExecutionContext = {
      ...createExecutionContext(),
      type: "community",
      community: {
        id: "community-1",
        name: "Test",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      capabilities: [
        "commands",
        "community.view"
      ]
    };

    const result =
      await service.handle(
        "/admin-only",
        {
          platform: execution.platform,
          user: execution.user,
          community: execution.community,
          channel: execution.channel
        },
        execution
      );

    expect(result).toEqual({
      handled: true,
      response: {
        content:
          "У вас нет прав для использования этой команды."
      }
    });
  });

  it("passes parsed arguments to the handler", async () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "echo",
      handler: (context) => ({
        content: context.args.join("|")
      })
    });

    const service =
      createService(registry);

    const execution =
      createExecutionContext();

    const result =
      await service.handle(
        "/echo one two three",
        {
          platform: execution.platform,
          user: execution.user,
          community: execution.community,
          channel: execution.channel
        },
        execution
      );

    expect(result).toEqual({
      handled: true,
      response: {
        content: "one|two|three"
      }
    });
  });

  it("passes the execution context to the command", async () => {
    const registry =
      new CommandRegistry();

    registry.register({
      name: "context",
      handler: (context) => ({
        content:
          `${context.execution.type}:${context.execution.correlationId}`
      })
    });

    const service =
      createService(registry);

    const execution =
      createExecutionContext();

    const result =
      await service.handle(
        "/context",
        {
          platform: execution.platform,
          user: execution.user,
          community: execution.community,
          channel: execution.channel
        },
        execution
      );

    expect(result).toEqual({
      handled: true,
      response: {
        content:
          "dm:test-correlation-id"
      }
    });
  });
});