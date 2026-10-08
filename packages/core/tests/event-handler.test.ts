import {
  describe,
  expect,
  it
} from "vitest";

import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands,
  createPlatformEventHandler,
  createPlatformExecutionContext,
  type AdapterAction,
  type AdapterEvent,
  type AdapterInteraction,
  type BoundInteractionResponse,
  type LogEntry,
  type Platform
} from "../src/index.js";

/**
 * Fake platform renderer: exposes the tokens of all
 * actionable buttons and menu options as metadata.
 */
function fakeRender(
  response: BoundInteractionResponse
): Record<string, unknown> | undefined {
  const tokens = [
    ...(response.buttons ?? [])
      .filter(
        (button) =>
          !button.disabled && button.token
      )
      .map((button) => button.token as string),
    ...(response.menus ?? []).flatMap(
      (menu) =>
        menu.options.map(
          (option) => option.token
        )
    )
  ];

  return tokens.length > 0
    ? { fake: { tokens } }
    : undefined;
}

function tokensOf(
  action: AdapterAction | undefined
): string[] {
  return (
    (
      action?.metadata as
        | { fake?: { tokens?: string[] } }
        | undefined
    )?.fake?.tokens ?? []
  );
}

function setup(
  platform: Platform = "telegram",
  failSend = false
) {
  const actions: AdapterAction[] = [];

  const answers: Array<{
    id: string;
    text: string;
  }> = [];

  const entries: LogEntry[] = [];

  const logger =
    new CoreLogger("debug");

  logger.addHandler((entry) => {
    entries.push(entry);
  });

  const registry =
    new CommandRegistry();

  createBuiltinCommands(registry);

  const commandService =
    new CommandService(
      new CommandParser(),
      registry,
      logger
    );

  const store =
    new InteractionActionStore();

  const dispatcher =
    new InteractionDispatcher(
      store,
      commandService,
      logger
    );

  const handler =
    createPlatformEventHandler({
      platform,
      responder: {
        id: `${platform}-test`,

        async sendAction(action) {
          if (failSend) {
            throw new Error("send failed");
          }

          actions.push(action);
        },

        answerInteraction(id, text) {
          answers.push({ id, text });
        }
      },
      logger,
      commandService,
      dispatcher,
      store,
      executionContextService:
        new ExecutionContextService(),
      renderMetadata: fakeRender
    });

  return {
    actions,
    answers,
    entries,
    handler
  };
}

function messageEvent(
  platform: Platform,
  content: string,
  options: {
    userId?: string;
    chatId?: string;
    community?: boolean;
  } = {}
): AdapterEvent {
  const userId =
    options.userId ?? "42";

  const chatId =
    options.chatId ?? "42";

  const chat = options.community
    ? {
        platform,
        externalId: chatId,
        name: "Test Group"
      }
    : undefined;

  return {
    type: "message.created",
    message: {
      externalId: "1",
      platform,
      author: {
        platform,
        externalId: userId,
        displayName: "Artem"
      },
      community: chat,
      channel: chat,
      destinationExternalId: chatId,
      content,
      createdAt: new Date()
    }
  };
}

function interactionEvent(
  platform: Platform,
  token: string | undefined,
  overrides: Partial<AdapterInteraction> = {}
): AdapterEvent {
  return {
    type: "interaction.created",
    interaction: {
      externalId: "cb-1",
      platform,
      user: {
        platform,
        externalId: "42",
        displayName: "Artem"
      },
      destinationExternalId: "42",
      messageExternalId: "10",
      token,
      createdAt: new Date(),
      ...overrides
    }
  };
}

describe("Platform event handler", () => {
  it("sends /menu with rendered interaction", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent("telegram", "/menu")
    );

    expect(actions).toHaveLength(1);

    expect(actions[0]).toMatchObject({
      type: "message.send",
      platform: "telegram",
      channelExternalId: "42",
      content: "Выберите действие:"
    });

    expect(tokensOf(actions[0])).toHaveLength(4);
  });

  it("edits the message when a button is pressed", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent("telegram", "/menu")
    );

    await handler(
      interactionEvent(
        "telegram",
        tokensOf(actions[0])[1]
      )
    );

    expect(actions).toHaveLength(2);

    expect(actions[1]).toMatchObject({
      type: "message.edit",
      channelExternalId: "42",
      messageExternalId: "10"
    });

    const content = (
      actions[1] as { content: string }
    ).content;

    expect(content).toContain("Аккаунт");
    expect(content).toContain("telegram:42");

    expect(tokensOf(actions[1])).toHaveLength(3);
  });

  it("returns to the menu with the back button", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent("telegram", "/menu")
    );

    await handler(
      interactionEvent(
        "telegram",
        tokensOf(actions[0])[1]
      )
    );

    await handler(
      interactionEvent(
        "telegram",
        tokensOf(actions[1])[1]
      )
    );

    expect(actions[2]).toMatchObject({
      type: "message.edit",
      content: "Выберите действие:"
    });
  });

  it("sends a new message when the interaction has no message id", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent("telegram", "/menu")
    );

    await handler(
      interactionEvent(
        "telegram",
        tokensOf(actions[0])[1],
        { messageExternalId: undefined }
      )
    );

    expect(actions).toHaveLength(2);

    expect(actions[1]).toMatchObject({
      type: "message.send",
      channelExternalId: "42"
    });
  });

  it("does not show account details in a community", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent("telegram", "/account", {
        chatId: "-100500",
        community: true
      })
    );

    expect(actions).toHaveLength(1);

    const content = (
      actions[0] as { content: string }
    ).content;

    expect(content).toContain(
      "У вас нет прав для использования этой команды."
    );
    expect(content).not.toContain("telegram:42");
  });

  it("answers an unknown token without sending messages", async () => {
    const { actions, answers, handler } =
      setup();

    await handler(
      interactionEvent("telegram", "missing")
    );

    expect(actions).toHaveLength(0);

    expect(answers).toHaveLength(1);
    expect(answers[0].id).toBe("cb-1");
    expect(answers[0].text).toContain(
      "больше недоступно"
    );
  });

  it("rejects a button pressed by another user", async () => {
    const { actions, answers, handler } =
      setup();

    await handler(
      messageEvent("telegram", "/menu")
    );

    await handler(
      interactionEvent(
        "telegram",
        tokensOf(actions[0])[1],
        {
          user: {
            platform: "telegram",
            externalId: "99",
            displayName: "Other"
          }
        }
      )
    );

    expect(actions).toHaveLength(1);

    expect(answers[0].text).toContain(
      "другому пользователю"
    );
  });

  it("ignores regular messages", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent("telegram", "hello")
    );

    expect(actions).toHaveLength(0);
  });

  it("ignores an interaction without a token", async () => {
    const { actions, answers, handler } =
      setup();

    await handler(
      interactionEvent("telegram", undefined)
    );

    expect(actions).toHaveLength(0);
    expect(answers).toHaveLength(0);
  });

  it("does nothing when the interaction has no destination", async () => {
    const { actions, answers, handler } =
      setup();

    await handler(
      messageEvent("telegram", "/menu")
    );

    await handler(
      interactionEvent(
        "telegram",
        tokensOf(actions[0])[1],
        { destinationExternalId: undefined }
      )
    );

    expect(actions).toHaveLength(1);
    expect(answers).toHaveLength(0);
  });

  it("does not throw when the responder fails and logs the error", async () => {
    const { entries, handler } = setup(
      "telegram",
      true
    );

    await expect(
      handler(
        messageEvent("telegram", "/menu")
      )
    ).resolves.toBeUndefined();

    const failure = entries.find(
      (entry) =>
        entry.message ===
        "telegram.event.failed"
    );

    expect(failure?.level).toBe("error");
  });

  it("uses platform-specific ids for Discord", async () => {
    const { actions, handler } =
      setup("discord");

    await handler(
      messageEvent("discord", "/menu", {
        userId: "111",
        chatId: "900"
      })
    );

    await handler(
      interactionEvent(
        "discord",
        tokensOf(actions[0])[1],
        {
          user: {
            platform: "discord",
            externalId: "111",
            displayName: "Artem"
          },
          destinationExternalId: "900"
        }
      )
    );

    expect(actions[1]).toMatchObject({
      type: "message.edit",
      platform: "discord",
      channelExternalId: "900"
    });

    expect(
      (actions[1] as { content: string }).content
    ).toContain("discord:111");
  });
});

describe("createPlatformExecutionContext", () => {
  const service =
    new ExecutionContextService();

  it("creates a DM context without community and channel", () => {
    const context =
      createPlatformExecutionContext(service, {
        platform: "telegram",
        correlationId: "corr",
        author: {
          platform: "telegram",
          externalId: "42",
          displayName: "Artem"
        }
      });

    expect(context.type).toBe("dm");
    expect(context.user.id).toBe("telegram:42");
    expect(context.user.displayName).toBe("Artem");
    expect(context.community).toBeUndefined();
    expect(context.channel).toBeUndefined();
  });

  it("creates a Telegram community context", () => {
    const chat = {
      platform: "telegram" as const,
      externalId: "-100500",
      name: "Group"
    };

    const context =
      createPlatformExecutionContext(service, {
        platform: "telegram",
        correlationId: "corr",
        author: {
          platform: "telegram",
          externalId: "42"
        },
        community: chat,
        channel: chat
      });

    expect(context.type).toBe("community");
    expect(context.community?.id).toBe(
      "telegram:-100500"
    );
    expect(context.channel?.id).toBe(
      "telegram:-100500"
    );
    expect(context.channel?.type).toBe(
      "telegram_chat"
    );
    expect(context.channel?.communityId).toBe(
      "telegram:-100500"
    );
  });

  it("creates a Discord community context", () => {
    const context =
      createPlatformExecutionContext(service, {
        platform: "discord",
        correlationId: "corr",
        author: {
          platform: "discord",
          externalId: "111"
        },
        community: {
          platform: "discord",
          externalId: "500",
          name: "Server"
        },
        channel: {
          platform: "discord",
          externalId: "900",
          name: "general"
        }
      });

    expect(context.community?.id).toBe(
      "discord:500"
    );
    expect(context.channel?.id).toBe(
      "discord:900"
    );
    expect(context.channel?.type).toBe(
      "discord_text"
    );
    expect(context.channel?.communityId).toBe(
      "discord:500"
    );
  });

  it("falls back from display name to username to external id", () => {
    const withUsername =
      createPlatformExecutionContext(service, {
        platform: "telegram",
        correlationId: "corr",
        author: {
          platform: "telegram",
          externalId: "7",
          username: "artem"
        }
      });

    const withIdOnly =
      createPlatformExecutionContext(service, {
        platform: "telegram",
        correlationId: "corr",
        author: {
          platform: "telegram",
          externalId: "8"
        }
      });

    expect(withUsername.user.displayName).toBe(
      "artem"
    );
    expect(withIdOnly.user.displayName).toBe(
      "8"
    );
  });
});