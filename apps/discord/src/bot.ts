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
  createMemberCommand,
  createBridgeTestInteractionHandler,
  createIdentityLinkCommand,
  BridgeService,
  listCommandDescriptors,
  type PlatformIdentityResolver,
  CommunityService,
  MembershipService,
  IdentityService,
  AccessControlService,
  ModexaDatabase
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

  accessControlService?:
    AccessControlService;

  database?:
    ModexaDatabase;
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

  const communityService =
    options.communityService ??
    new CommunityService();

  const membershipService =
    options.membershipService ??
    new MembershipService();

  const identityService =
    options.identityService ??
    new IdentityService();

  const identityLinkService =
    options.identityLinkService ??
    new IdentityLinkService();

  const identityLinkingService =
    options.identityLinkingService ??
    new IdentityLinkingService(
      identityService,
      identityLinkService
    );

  const bridgeService =
    options.bridgeService ??
    new BridgeService(
      communityService
    );

  const accessControlService =
    options.accessControlService ??
    new AccessControlService();

  createBuiltinCommands(
    registry,
    communityService,
    identityService,
    membershipService,
    accessControlService,
    options.database
  );

  registry.register(
    createIdentityLinkCommand(
      identityService,
      identityLinkService,
      identityLinkingService
    )
  );

  registry.register(
    createBridgeTestCommand(
      bridgeService,
      identityService,
      membershipService
    )
  );

  registry.register(
    createMemberCommand(
      identityService,
      membershipService,
      accessControlService
    )
  );

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

  dispatcher.registerCallback(
    "bridge.test.",
    createBridgeTestInteractionHandler(
      bridgeService,
      membershipService
    )
  );

  dispatcher.registerCallback(
    "menu.close",
    () => ({ close: true })
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
          process.env
            .DISCORD_GUILD_ID ??
          undefined,

        logger,

        bridgeService:
          bridgeService
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
        bridgeService
    })
  );

  return adapter;
}
