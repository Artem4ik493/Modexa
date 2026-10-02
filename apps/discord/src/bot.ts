import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  IdentityLinkService,
  IdentityLinkingService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands,
  createBridgeTestCommand,
  createBridgeTestInteractionHandler,
  createIdentityLinkCommand,
  BridgeService,
  listCommandDescriptors,
  type PlatformIdentityResolver,
  type CommunityService,
  type MembershipService,
  IdentityService
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

  communityService?:
    CommunityService;

  membershipService?:
    MembershipService;

  identityService?:
    IdentityService;

  identityLinkService?:
    IdentityLinkService;

  identityLinkingService?:
    IdentityLinkingService;
}

export function createDiscordAdapter(
  token: string,
  logger: CoreLogger,
  options:
    CreateDiscordAdapterOptions = {}
): DiscordAdapter {
  const client =
    new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [
        Partials.Channel
      ]
    });

  const registry =
    new CommandRegistry();

  createBuiltinCommands(
    registry,
    options.communityService
  );

  if (
    options.identityService &&
    options.identityLinkService &&
    options.identityLinkingService
  ) {
    registry.register(
      createIdentityLinkCommand(
        options.identityService,
        options.identityLinkService,
        options.identityLinkingService
      )
    );
  }

  if (options.bridgeService) {
    registry.register(
      createBridgeTestCommand(
        options.bridgeService,
        options.identityService ??
          new IdentityService(),
        options.membershipService
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
        options.bridgeService,
        options.membershipService
      )
    );
  }

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
          process.env
            .DISCORD_GUILD_ID ??
          undefined,

        logger,

        bridgeService:
          options.bridgeService
      }
    );

  adapter.onEvent(
    createDiscordEventHandler({
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
