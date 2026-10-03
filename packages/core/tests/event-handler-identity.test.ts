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
  createRuntimeServices,
  type AdapterAction,
  type AdapterEvent,
  type BoundInteractionResponse,
  type Platform,
  type RuntimeServices
} from "../src/index.js";

function fakeRender(
  response: BoundInteractionResponse
): Record<string, unknown> | undefined {
  const tokens = (response.buttons ?? [])
    .filter(
      (button) =>
        !button.disabled && button.token
    )
    .map((button) => button.token as string);

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
  platform: Platform,
  services: RuntimeServices
) {
  const actions: AdapterAction[] = [];

  const logger =
    new CoreLogger("debug");

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
          actions.push(action);
        },

        answerInteraction() {}
      },
      logger,
      commandService,
      dispatcher,
      store,
      executionContextService:
        new ExecutionContextService(),
      identityResolver:
        services.identityResolver,
      renderMetadata: fakeRender
    });

  return { actions, handler };
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
    options.chatId ?? userId;

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

describe("Platform event handler with real identities", () => {
  it("shows the real Modexa user id in /account", async () => {
    const services = createRuntimeServices();

    const { actions, handler } = setup(
      "telegram",
      services
    );

    await handler(
      messageEvent("telegram", "/menu")
    );

    // Account button is the first one.
    await handler({
      type: "interaction.created",
      interaction: {
        externalId: "cb-1",
        platform: "telegram",
        user: {
          platform: "telegram",
          externalId: "42",
          displayName: "Artem"
        },
        destinationExternalId: "42",
        messageExternalId: "10",
        token: tokensOf(actions[0])[0],
        createdAt: new Date()
      }
    });

    const content = (
      actions[1] as { content: string }
    ).content;

    expect(actions[1].type).toBe(
      "message.edit"
    );

    expect(content).toMatch(
      /ID аккаунта: mx_[0-9a-f-]{36}/
    );
    expect(content).not.toContain(
      "telegram:42"
    );
  });

  it("creates community and membership for a command in a group", async () => {
    const services = createRuntimeServices();

    const { handler } = setup(
      "telegram",
      services
    );

    await handler(
      messageEvent("telegram", "/ping", {
        chatId: "-100500",
        community: true
      })
    );

    expect(
      services.communityService.findByIdentity(
        "telegram",
        "-100500"
      )?.id
    ).toBe("community-1");

    expect(
      services.membershipService.getCommunityMemberships(
        "community-1"
      )
    ).toHaveLength(1);
  });

  it("gives different Modexa users to Telegram and Discord accounts", async () => {
    const services = createRuntimeServices();

    const telegram = setup(
      "telegram",
      services
    );

    const discord = setup(
      "discord",
      services
    );

    await telegram.handler(
      messageEvent("telegram", "/ping", {
        userId: "42"
      })
    );

    await discord.handler(
      messageEvent("discord", "/ping", {
        userId: "42"
      })
    );

    const telegramUser =
      services.identityService.findUserByIdentity(
        "telegram",
        "42"
      );

    const discordUser =
      services.identityService.findUserByIdentity(
        "discord",
        "42"
      );

    expect(telegramUser).toBeDefined();
    expect(discordUser).toBeDefined();

    expect(telegramUser?.id).not.toBe(
      discordUser?.id
    );
  });

  it("keeps button ownership working with real user ids", async () => {
    const services = createRuntimeServices();

    const { actions, handler } = setup(
      "telegram",
      services
    );

    await handler(
      messageEvent("telegram", "/menu")
    );

    const press = (userExternalId: string) =>
      handler({
        type: "interaction.created",
        interaction: {
          externalId: `cb-${userExternalId}`,
          platform: "telegram",
          user: {
            platform: "telegram",
            externalId: userExternalId,
            displayName: "User"
          },
          destinationExternalId: "42",
          messageExternalId: "10",
          token: tokensOf(actions[0])[0],
          createdAt: new Date()
        }
      });

    // Another user must not use the owner's button.
    await press("99");

    expect(actions).toHaveLength(1);

    // The owner can.
    await press("42");

    expect(actions).toHaveLength(2);

    expect(actions[1].type).toBe(
      "message.edit"
    );
  });
});