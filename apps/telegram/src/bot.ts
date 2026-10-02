import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands,
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
   * real Modexa entities. When omitted, synthetic ids
   * ("telegram:<id>") are used.
   */
  identityResolver?: PlatformIdentityResolver;
}

export function createTelegramAdapter(
  token: string,
  logger: CoreLogger,
  options: CreateTelegramAdapterOptions = {}
): TelegramAdapter {
  const bot =
    new Bot(token);

  const registry =
    new CommandRegistry();

  createBuiltinCommands(
    registry
  );

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

  const adapter =
    new TelegramAdapter(
      bot
    );

  adapter.onEvent(
    createTelegramEventHandler({
      responder: adapter,
      logger,
      commandService,
      dispatcher,
      store,
      executionContextService:
        new ExecutionContextService(),
      identityResolver:
        options.identityResolver
    })
  );

  return adapter;
}