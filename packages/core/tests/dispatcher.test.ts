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
  InteractionDispatcher
} from "../src/index.js";

import type {
  ExecutionContext
} from "../src/contexts/types.js";

import type {
  LogEntry
} from "../src/diagnostics/types.js";

function createExecution(
  userId = "user-1"
): ExecutionContext {
  return new ExecutionContextService().create({
    platform: "telegram",
    correlationId: "corr-test",
    user: {
      id: userId,
      displayName: "Test User",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
}

function createDispatcher() {
  const registry =
    new CommandRegistry();

  registry.register({
    name: "echo",
    handler: (context) => ({
      content: context.args.join("|")
    })
  });

  registry.register({
    name: "whereami",
    handler: (context) => ({
      content: context.execution.type
    })
  });

  const logger =
    new CoreLogger("debug");

  const entries: LogEntry[] = [];

  logger.addHandler((entry) => {
    entries.push(entry);
  });

  const store =
    new InteractionActionStore();

  const dispatcher =
    new InteractionDispatcher(
      store,
      new CommandService(
        new CommandParser(),
        registry
      ),
      logger
    );

  return {
    store,
    dispatcher,
    entries
  };
}

const scope = {
  userId: "user-1",
  platform: "telegram"
};

describe("InteractionDispatcher", () => {
  it("executes a command action with its arguments", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const token = store.create({
      action: {
        type: "command",
        command: "/echo",
        args: ["one", "two"]
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result).toEqual({
      status: "handled",
      response: {
        content: "one|two",
        buttons: undefined,
        menus: undefined
      }
    });
  });

  it("accepts commands with or without a leading slash", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const token = store.create({
      action: {
        type: "command",
        command: "echo",
        args: ["ok"]
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result.status).toBe("handled");
  });

  it("passes the execution context to commands", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const token = store.create({
      action: {
        type: "command",
        command: "/whereami"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result).toMatchObject({
      status: "handled",
      response: {
        content: "dm"
      }
    });
  });

  it("executes a registered callback handler", async () => {
    const { store, dispatcher } =
      createDispatcher();

    dispatcher.registerCallback(
      "account",
      (context) => ({
        content: `account:${context.execution.user.id}`
      })
    );

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
        execution: createExecution()
      });

    expect(result).toMatchObject({
      status: "handled",
      response: {
        content: "account:user-1"
      }
    });
  });

  it("passes the selected value to a menu handler", async () => {
    const { store, dispatcher } =
      createDispatcher();

    dispatcher.registerMenu(
      "plan",
      (context) => ({
        content: `plan:${context.value}`
      })
    );

    const token = store.create({
      action: {
        type: "menu",
        menuId: "plan",
        value: "pro"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result).toMatchObject({
      status: "handled",
      response: {
        content: "plan:pro"
      }
    });
  });

  it("binds tokens to the response of a handler", async () => {
    const { store, dispatcher } =
      createDispatcher();

    dispatcher.registerCallback(
      "settings",
      () => ({
        content: "Settings",
        buttons: [
          {
            id: "back",
            label: "Back",
            action: {
              type: "callback",
              data: "account"
            }
          }
        ]
      })
    );

    const token = store.create({
      action: {
        type: "callback",
        data: "settings"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result.status).toBe("handled");

    if (result.status !== "handled") {
      return;
    }

    const backToken =
      result.response.buttons?.[0].token;

    expect(backToken).toBeDefined();

    expect(
      store.resolve(
        backToken!,
        {
          userId: "user-1",
          platform: "telegram"
        }
      )
    ).toEqual({
      status: "ok",
      action: {
        type: "callback",
        data: "account"
      }
    });
  });

  it("returns not_found for an unknown token", async () => {
    const { dispatcher } =
      createDispatcher();

    const result =
      await dispatcher.dispatch({
        token: "missing",
        execution: createExecution()
      });

    expect(result.status).toBe(
      "not_found"
    );
  });

  it("returns expired for an expired token", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const now = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const token = store.create({
      action: {
        type: "command",
        command: "/echo"
      },
      scope,
      ttlMs: 1000,
      now
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution(),
        now: new Date(
          now.getTime() + 2000
        )
      });

    expect(result.status).toBe("expired");
  });

  it("returns forbidden when another user presses the button", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const token = store.create({
      action: {
        type: "command",
        command: "/echo"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution:
          createExecution("user-2")
      });

    expect(result.status).toBe(
      "forbidden"
    );
  });

  it("returns unhandled when no callback handler is registered", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const token = store.create({
      action: {
        type: "callback",
        data: "unknown"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result.status).toBe(
      "unhandled"
    );
  });

  it("returns handled with a not-found response when the command does not exist", async () => {
    const { store, dispatcher } =
      createDispatcher();

    const token = store.create({
      action: {
        type: "command",
        command: "/nope"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result).toMatchObject({
      status: "handled",
      response: {
        content:
          "Команда не найдена. Для просмотра доступных команд для вашей роли user используйте /help."
      }
    });
  });

  it("returns failed and logs the error when a handler throws", async () => {
    const { store, dispatcher, entries } =
      createDispatcher();

    dispatcher.registerCallback(
      "boom",
      () => {
        throw new Error("boom");
      }
    );

    const token = store.create({
      action: {
        type: "callback",
        data: "boom"
      },
      scope
    });

    const result =
      await dispatcher.dispatch({
        token,
        execution: createExecution()
      });

    expect(result.status).toBe("failed");

    const failure = entries.find(
      (entry) =>
        entry.message ===
        "interaction.failed"
    );

    expect(failure?.level).toBe("error");

    expect(
      failure?.context?.correlationId
    ).toBe("corr-test");
  });
});