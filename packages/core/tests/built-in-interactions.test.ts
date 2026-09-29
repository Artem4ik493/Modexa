import {
  describe,
  expect,
  it
} from "vitest";

import {
  CommandParser,
  CommandRegistry,
  CommandService,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands
} from "../src/index.js";

function setup(inCommunity = false) {
  const registry =
    new CommandRegistry();

  createBuiltinCommands(registry);

  const store =
    new InteractionActionStore();

  const dispatcher =
    new InteractionDispatcher(
      store,
      new CommandService(
        new CommandParser(),
        registry
      )
    );

  const now = new Date();

  const execution =
    new ExecutionContextService().create({
      platform: "telegram",
      correlationId: "corr-test",
      user: {
        id: "user-1",
        displayName: "Artem",
        createdAt: now,
        updatedAt: now
      },
      community: inCommunity
        ? {
            id: "community-1",
            name: "Test",
            createdAt: now,
            updatedAt: now
          }
        : undefined
    });

  return {
    store,
    dispatcher,
    execution
  };
}

const scope = {
  userId: "user-1",
  platform: "telegram"
};

describe("built-in menu commands", () => {
  it("shows account details with a working back button", async () => {
    const { store, dispatcher, execution } =
      setup();

    const token = store.create({
      action: {
        type: "command",
        command: "/account"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution
      });

    expect(result.status).toBe("handled");

    if (result.status !== "handled") {
      return;
    }

    expect(result.response.content).toContain(
      "user-1"
    );

    expect(result.response.content).toContain(
      "Context: dm"
    );

    const backToken =
      result.response.buttons?.[0].token;

    expect(backToken).toBeDefined();

    const back =
      await dispatcher.dispatch({
        token: backToken!,
        execution
      });

    expect(back).toMatchObject({
      status: "handled",
      response: {
        content: "Choose an action:"
      }
    });
  });

  it("shows settings in a private chat", async () => {
    const { store, dispatcher, execution } =
      setup();

    const token = store.create({
      action: {
        type: "command",
        command: "/settings"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution
      });

    expect(result).toMatchObject({
      status: "handled",
      response: {
        content:
          "Settings\nNothing to configure yet."
      }
    });
  });

  it("does not expose account details in a community", async () => {
    const { store, dispatcher, execution } =
      setup(true);

    const token = store.create({
      action: {
        type: "command",
        command: "/account"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution
      });

    expect(result.status).toBe("handled");

    if (result.status !== "handled") {
      return;
    }

    expect(
      result.response.content
    ).toContain("private chat");

    expect(
      result.response.content
    ).not.toContain("user-1");

    expect(
      result.response.buttons
    ).toBeUndefined();
  });

  it("returns the main menu with two command buttons", async () => {
    const { store, dispatcher, execution } =
      setup();

    const token = store.create({
      action: {
        type: "command",
        command: "/menu"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution
      });

    expect(result.status).toBe("handled");

    if (result.status !== "handled") {
      return;
    }

    expect(
      result.response.buttons
    ).toHaveLength(2);
  });
});