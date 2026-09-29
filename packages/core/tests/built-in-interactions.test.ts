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
  createBuiltinCommands,
  registerBuiltinInteractions
} from "../src/index.js";

function setup() {
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

  registerBuiltinInteractions(dispatcher);

  const execution =
    new ExecutionContextService().create({
      platform: "telegram",
      correlationId: "corr-test",
      user: {
        id: "user-1",
        displayName: "Artem",
        createdAt: new Date(),
        updatedAt: new Date()
      }
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

describe("built-in interactions", () => {
  it("shows account details with a working back button", async () => {
    const { store, dispatcher, execution } =
      setup();

    const token = store.create({
      action: {
        type: "callback",
        data: "account"
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

  it("returns the menu from the menu callback", async () => {
    const { store, dispatcher, execution } =
      setup();

    const token = store.create({
      action: {
        type: "callback",
        data: "menu"
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
    ).toHaveLength(3);

    expect(
      result.response.buttons?.[2].token
    ).toBeUndefined();
  });
});