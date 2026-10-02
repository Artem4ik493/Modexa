import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands,
  listCommandDescriptors,
  type PlatformIdentityResolver
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

import {
  buildDiscordSlashCommands
} from "./slash-commands.js";

export interface CreateDiscordAdapterOptions {
  /**
   * Register slash commands on this server only.
   * Defaults to the DISCORD_GUILD_ID environment variable.
   * When neither is set, commands are registered globally.
   */
  guildId?: string;

  /**
   * Shared resolver that maps Discord users and servers to
   * real Modexa entities. When omitted, synthetic ids
   * ("discord:<id>") are used.
   */
  identityResolver?: PlatformIdentityResolver;
}

export function createDiscordAdapter(
  token: string,
  logger: CoreLogger,
  options: CreateDiscordAdapterOptions = {}
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
      token,
      {
        slashCommands:
          buildDiscordSlashCommands(
            listCommandDescriptors(
              registry
            )
          ),
        guildId:
          options.guildId ??
          process.env.DISCORD_GUILD_ID ??
          undefined,
        logger
      }
    );

  adapter.onEvent(
    createDiscordEventHandler({
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