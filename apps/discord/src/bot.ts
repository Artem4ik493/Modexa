import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands
} from "@modexa/core";

import {
  Client,
  GatewayIntentBits,
  Partials
} from "discord.js";

import {
  DiscordAdapter
} from "./adapter.js";

import {
  createDiscordEventHandler
} from "./handler.js";

export function createDiscordAdapter(
  token: string,
  logger: CoreLogger
): DiscordAdapter {
  const client =
    new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
      ],
      // Required to receive direct messages.
      partials: [Partials.Channel]
    });

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
    new DiscordAdapter(
      client,
      token
    );

  adapter.onEvent(
    createDiscordEventHandler({
      responder: adapter,
      logger,
      commandService,
      dispatcher,
      store,
      executionContextService:
        new ExecutionContextService()
    })
  );

  return adapter;
}