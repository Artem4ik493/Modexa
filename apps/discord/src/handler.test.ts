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
  type AdapterAction,
  type AdapterEvent
} from "@modexa/core";

import {
  createDiscordEventHandler
} from "./handler.js";

import {
  parseDiscordCustomId,
  type DiscordActionRow
} from "./interactions.js";

function setup() {
  const actions: AdapterAction[] = [];

  const answers: Array<{
    id: string;
    text: string;
  }> = [];

  const logger =
    new CoreLogger("error");

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

  dispatcher.registerCallback(
    "menu.close",
    () => ({ close: true })
  );

  const handler =
    createDiscordEventHandler({
      responder: {
        id: "discord-test",

        async sendAction(action) {
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
        new ExecutionContextService()
    });

  return {
    actions,
    answers,
    handler
  };
}

function messageEvent(
  content: string,
  userId = "111",
  channelId = "900",
  guild = false
): AdapterEvent {
  return {
    type: "message.created",
    message: {
      externalId: "1",
      platform: "discord",
      author: {
        platform: "discord",
        externalId: userId,
        displayName: "Artem"
      },
      community: guild
        ? {
            platform: "discord",
            externalId: "500",
            name: "Test Server"
          }
        : undefined,
      channel: guild
        ? {
            platform: "discord",
            externalId: channelId,
            name: "general"
          }
        : undefined,
      destinationExternalId: channelId,
      content,
      createdAt: new Date()
    }
  };
}

function interactionEvent(
  token: string,
  userId = "111",
  channelId = "900",
  messageId = "10"
): AdapterEvent {
  return {
    type: "interaction.created",
    interaction: {
      externalId: "int-1",
      platform: "discord",
      user: {
        platform: "discord",
        externalId: userId,
        displayName: "Artem"
      },
      destinationExternalId: channelId,
      messageExternalId: messageId,
      token,
      createdAt: new Date()
    }
  };
}

function customIdTokens(
  action: AdapterAction | undefined
): string[] {
  const rows = (
    action?.metadata as
      | {
          discord?: {
            components?: DiscordActionRow[];
          };
        }
      | undefined
  )?.discord?.components;

  return (rows ?? [])
    .flatMap((row) => row.components)
    .map((button) =>
      parseDiscordCustomId(
        button.custom_id
      )
    )
    .filter(
      (token): token is string =>
        token !== undefined
    );
}

describe("Discord event handler", () => {
  it("sends /menu with tokenized buttons", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    expect(actions).toHaveLength(1);

    expect(actions[0]).toMatchObject({
      type: "message.send",
      platform: "discord",
      channelExternalId: "900",
      content: "Выберите действие:"
    });

    expect(
      customIdTokens(actions[0])
    ).toHaveLength(4);
  });

  it("edits the message when a button is pressed", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    const accountToken =
      customIdTokens(actions[0])[1];

    await handler(
      interactionEvent(accountToken)
    );

    expect(actions).toHaveLength(2);

    const edit = actions[1];

    expect(edit).toMatchObject({
      type: "message.edit",
      channelExternalId: "900",
      messageExternalId: "10"
    });

    const content = (
      edit as { content: string }
    ).content;

    expect(content).toContain("Аккаунт");
    expect(content).toContain(
      "discord:111"
    );

    expect(
      customIdTokens(edit)
    ).toHaveLength(3);
  });

  it("returns to the menu with the back button", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    await handler(
      interactionEvent(
        customIdTokens(actions[0])[0]
      )
    );

    await handler(
      interactionEvent(
        customIdTokens(actions[1])[0]
      )
    );

    expect(actions[2]).toMatchObject({
      type: "message.edit",
      content: "Выберите действие:"
    });
  });

  it("closes an interactive menu", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    const closeToken =
      customIdTokens(actions[0])[3];

    await handler(
      interactionEvent(closeToken)
    );

    expect(actions).toHaveLength(2);
    expect(actions[1]).toMatchObject({
      type: "message.delete",
      channelExternalId: "900",
      messageExternalId: "10"
    });
  });

  it("does not show account details in a server", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent(
        "/account",
        "111",
        "900",
        true
      )
    );

    expect(actions).toHaveLength(1);

    const content = (
      actions[0] as { content: string }
    ).content;

    expect(content).toContain(
      "нет прав для использования этой команды"
    );

    expect(content).not.toContain(
      "discord:111"
    );
  });

  it("answers an unknown token without sending messages", async () => {
    const { actions, answers, handler } =
      setup();

    await handler(
      interactionEvent("missing")
    );

    expect(actions).toHaveLength(0);

    expect(answers).toHaveLength(1);

    expect(answers[0].id).toBe("int-1");

    expect(answers[0].text).toContain(
      "больше недоступно"
    );
  });

  it("rejects a button pressed by another user", async () => {
    const { actions, answers, handler } =
      setup();

    await handler(messageEvent("/menu"));

    await handler(
      interactionEvent(
        customIdTokens(actions[0])[0],
        "999"
      )
    );

    expect(actions).toHaveLength(1);

    expect(answers[0].text).toContain(
      "другому пользователю"
    );
  });

  it("ignores regular messages", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("hello"));

    expect(actions).toHaveLength(0);
  });
});