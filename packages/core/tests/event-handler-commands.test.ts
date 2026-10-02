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
  type AdapterAction,
  type AdapterEvent
} from "../src/index.js";

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

  const handler =
    createPlatformEventHandler({
      platform: "discord",
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
        new ExecutionContextService(),
      renderMetadata: () => undefined
    });

  return {
    actions,
    answers,
    handler
  };
}

function invocationEvent(
  name: string,
  locale?: string
): AdapterEvent {
  return {
    type: "command.invoked",
    invocation: {
      externalId: "slash-1",
      platform: "discord",
      user: {
        platform: "discord",
        externalId: "111",
        displayName: "Artem",
        locale
      },
      destinationExternalId: "900",
      name,
      args: [],
      createdAt: new Date()
    }
  };
}

function messageEvent(
  content: string
): AdapterEvent {
  return {
    type: "message.created",
    message: {
      externalId: "1",
      platform: "discord",
      author: {
        platform: "discord",
        externalId: "111",
        displayName: "Artem"
      },
      destinationExternalId: "900",
      content,
      createdAt: new Date()
    }
  };
}

describe("command.invoked", () => {
  it("runs the command and replies to the invocation", async () => {
    const { actions, handler } = setup();

    await handler(invocationEvent("menu"));

    expect(actions).toHaveLength(1);

    expect(actions[0]).toMatchObject({
      type: "message.send",
      platform: "discord",
      channelExternalId: "900",
      replyToExternalId: "slash-1",
      content: "Выберите действие:"
    });
  });

  it("runs commands in a DM context", async () => {
    const { actions, handler } = setup();

    await handler(invocationEvent("account"));

    const content = (
      actions[0] as { content: string }
    ).content;

    expect(content).toContain("discord:111");
    expect(content).toContain(
      "личный чат"
    );
  });

  it("replies when a command is not found", async () => {
    const { actions, handler } = setup();

    await handler(invocationEvent("nope"));

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: "message.send",
      platform: "discord",
      channelExternalId: "900",
      content:
        "Команда не найдена. Для просмотра доступных команд для вашей роли user используйте /help."
    });
  });

  it("does not set replyToExternalId for text messages", async () => {
    const { actions, handler } = setup();

    await handler(messageEvent("/menu"));

    expect(actions).toHaveLength(1);

    expect(
      (
        actions[0] as {
          replyToExternalId?: string;
        }
      ).replyToExternalId
    ).toBeUndefined();
  });
});

describe("user locale", () => {
  it("answers in English for an English user", async () => {
    const { actions, handler } = setup();

    await handler(
      invocationEvent("menu", "en-US")
    );

    expect(actions[0]).toMatchObject({
      content: "Choose an action:"
    });
  });

  it("answers in Russian for a Russian user", async () => {
    const { actions, handler } = setup();

    await handler(
      invocationEvent("menu", "ru")
    );

    expect(actions[0]).toMatchObject({
      content: "Выберите действие:"
    });
  });

  it("falls back to Russian for an unsupported locale", async () => {
    const { actions, handler } = setup();

    await handler(
      invocationEvent("menu", "de")
    );

    expect(actions[0]).toMatchObject({
      content: "Выберите действие:"
    });
  });

  it("translates interaction errors for an English user", async () => {
    const { answers, handler } = setup();

    await handler({
      type: "interaction.created",
      interaction: {
        externalId: "int-1",
        platform: "discord",
        user: {
          platform: "discord",
          externalId: "111",
          locale: "en-US"
        },
        destinationExternalId: "900",
        messageExternalId: "10",
        token: "missing",
        createdAt: new Date()
      }
    });

    expect(answers[0].text).toBe(
      "This action is no longer available."
    );
  });
});