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

import type {
  InlineKeyboard
} from "grammy";

import {
  createTelegramEventHandler
} from "./handler.js";

import {
  parseTelegramCallbackData
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
    createTelegramEventHandler({
      responder: {
        id: "telegram-test",

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
  userId = "42",
  chatId = "42",
  group = false
): AdapterEvent {
  const chat = group
    ? {
        platform: "telegram" as const,
        externalId: chatId,
        name: "Test Group"
      }
    : undefined;

  return {
    type: "message.created",
    message: {
      externalId: "1",
      platform: "telegram",
      author: {
        platform: "telegram",
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
  token: string,
  userId = "42",
  chatId = "42",
  messageId = "10"
): AdapterEvent {
  return {
    type: "interaction.created",
    interaction: {
      externalId: "cb-1",
      platform: "telegram",
      user: {
        platform: "telegram",
        externalId: userId,
        displayName: "Artem"
      },
      destinationExternalId: chatId,
      messageExternalId: messageId,
      token,
      createdAt: new Date()
    }
  };
}

function callbackTokens(
  action: AdapterAction | undefined
): string[] {
  const markup = (
    action?.metadata as
      | {
          telegram?: {
            replyMarkup?: InlineKeyboard;
          };
        }
      | undefined
  )?.telegram?.replyMarkup;

  return (markup?.inline_keyboard ?? [])
    .flat()
    .map((button) =>
      "callback_data" in button
        ? parseTelegramCallbackData(
            button.callback_data
          )
        : undefined
    )
    .filter(
      (token): token is string =>
        token !== undefined
    );
}

describe("Telegram event handler", () => {
  it("sends /menu with tokenized buttons", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    expect(actions).toHaveLength(1);

    expect(actions[0]).toMatchObject({
      type: "message.send",
      channelExternalId: "42",
      content: "Выберите действие:"
    });

    expect(
      callbackTokens(actions[0])
    ).toHaveLength(4);
  });

  it("edits the message when a button is pressed", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    const [, accountToken] =
      callbackTokens(actions[0]);

    await handler(
      interactionEvent(accountToken)
    );

    expect(actions).toHaveLength(2);

    const edit = actions[1];

    expect(edit).toMatchObject({
      type: "message.edit",
      channelExternalId: "42",
      messageExternalId: "10"
    });

    const content = (
      edit as { content: string }
    ).content;

    expect(content).toContain("Аккаунт");
    expect(content).toContain(
      "telegram:42"
    );

    expect(
      callbackTokens(edit)
    ).toHaveLength(3);
  });

  it("returns to the menu with the back button", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    await handler(
      interactionEvent(
        callbackTokens(actions[0])[0]
      )
    );

    await handler(
      interactionEvent(
        callbackTokens(actions[1])[5]
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
      callbackTokens(actions[0])[3];

    await handler(
      interactionEvent(closeToken)
    );

    expect(actions).toHaveLength(2);
    expect(actions[1]).toMatchObject({
      type: "message.delete",
      channelExternalId: "42",
      messageExternalId: "10"
    });
  });

  it("does not show account details in a group", async () => {
    const { actions, handler } = setup();

    await handler(
      messageEvent(
        "/account",
        "42",
        "-100500",
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
      "telegram:42"
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

    expect(answers[0].id).toBe("cb-1");

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
        callbackTokens(actions[0])[0],
        "99"
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