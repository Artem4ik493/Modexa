import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands,
  createBridgeTestCommand,
  createBridgeTestInteractionHandler,
  BridgeService,
  type PlatformIdentityResolver
} from "@modexa/core";

import {
  Bot
} from "grammy";

import {
  TelegramAdapter
} from "./adapter.js";

import {
  createTelegramEventHandler
} from "./handler.js";

export interface CreateTelegramAdapterOptions {
  /**
   * Shared resolver that maps Telegram users and chats to
   * real Modexa entities.
   */
  identityResolver?:
    PlatformIdentityResolver;

  /**
   * Shared execution context service.
   * Runner passes the same instance to every adapter.
   */
  executionContextService?:
    ExecutionContextService;

  interactionStore?:
    InteractionActionStore;

  bridgeService?:
    BridgeService;
}

export function createTelegramAdapter(
  token: string,
  logger: CoreLogger,
  options:
    CreateTelegramAdapterOptions = {}
): TelegramAdapter {
  const bot =
    new Bot(token);

  const registry =
    new CommandRegistry();

  createBuiltinCommands(
    registry
  );

  if (options.bridgeService) {
    registry.register(
      createBridgeTestCommand(
        options.bridgeService
      )
    );
  }

  const commandService =
    new CommandService(
      new CommandParser(),
      registry,
      logger
    );

  const store =
    options.interactionStore ??
    new InteractionActionStore();

  const dispatcher =
    new InteractionDispatcher(
      store,
      commandService,
      logger
    );

  if (options.bridgeService) {
    dispatcher.registerCallback(
      "bridge.test.",
      createBridgeTestInteractionHandler(
        options.bridgeService
      )
    );
  }

  const adapter =
    new TelegramAdapter(
      bot
    );

  adapter.onEvent(
    createTelegramEventHandler({
      responder:
        adapter,
      logger,
      commandService,
      dispatcher,
      store,
      executionContextService:
        options.executionContextService ??
        new ExecutionContextService(),
      identityResolver:
        options.identityResolver,
      bridgeService:
        options.bridgeService
    })
  );

  return adapter;
}