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
  createMembersCommand,
  createRoleCommand,
  createAccountInteractionHandler,
  createCommunitySettingsInteractionHandler,
  createBridgeTestInteractionHandler,
  createIdentityLinkCommand,
  BridgeService,
  listCommandDescriptors,
  type PlatformIdentityResolver,
  CommunityService,
  MembershipService,
  IdentityService,
  AccessControlService,
  ModexaDatabase,
  ModerationService,
  CommandSettingsService,
  createModerationCommands,
  createModerationRestoreCommands,
  createPublicFeatureCommands,
  type MemberDirectory,
  type AuditService
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

  moderationService?:
    ModerationService;

  commandSettingsService?:
    import("@modexa/core").CommandSettingsService;

  auditService?: AuditService;
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
        GatewayIntentBits.GuildMembers,
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

  let memberDirectory:
    MemberDirectory | undefined;

  const communityService =
    options.communityService ??
    new CommunityService();

  const resolveDiscordGuildId = (
    communityId: string
  ): string | undefined => {
    const identity =
      communityService
        .getCommunityIdentities(
          communityId
        )
        .find(
          (item) =>
            item.platform === "discord"
        );

    return identity?.externalId;
  };

  const memberDirectoryProxy: MemberDirectory = {
    getMember(
      communityId,
      userExternalId
    ) {
      const guildId =
        resolveDiscordGuildId(
          communityId
        );

      return guildId && memberDirectory
        ? memberDirectory.getMember(
            guildId,
            userExternalId
          )
        : Promise.resolve(undefined);
    },

    listMembers(
      communityId
    ) {
      const guildId =
        resolveDiscordGuildId(
          communityId
        );

      return guildId && memberDirectory
        ? memberDirectory.listMembers(
            guildId
          )
        : Promise.resolve([]);
    },

    findMemberByUsername(
      communityId,
      username
    ) {
      const guildId =
        resolveDiscordGuildId(
          communityId
        );

      return guildId &&
        memberDirectory?.findMemberByUsername
        ? memberDirectory.findMemberByUsername(
            guildId,
            username
          )
        : Promise.resolve(undefined);
    }
  };

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
    new AccessControlService(
      options.database,
      options.database
    );

  const moderationService =
    options.moderationService ??
    new ModerationService(accessControlService);

  const commandSettingsService =
    options.commandSettingsService ??
    new CommandSettingsService(options.database);

  createBuiltinCommands(
    registry,
    communityService,
    identityService,
    membershipService,
    accessControlService,
    options.database,
    options.bridgeService
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
      accessControlService,
      memberDirectoryProxy,
      logger,
      options.database
    )
  );

  registry.register(
    createMembersCommand(
      identityService,
      membershipService,
      accessControlService,
      memberDirectoryProxy,
      options.database
    )
  );

  registry.register(
    createRoleCommand(
      identityService,
      membershipService,
      accessControlService,
      memberDirectoryProxy
    )
  );

  for (const command of createModerationCommands(
    identityService,
    membershipService,
    communityService,
    moderationService,
    memberDirectoryProxy,
    async (action) => {
      if (!adapter) throw new Error("Discord adapter is not ready");
      await adapter.sendAction(action);
    }
  )) {
    registry.register(command);
  }

  for (const command of createModerationRestoreCommands(
    identityService,
    membershipService,
    communityService,
    moderationService,
    async (action) => {
      if (!adapter) throw new Error("Discord adapter is not ready");
      await adapter.sendAction(action);
    },
    memberDirectoryProxy
  )) {
    registry.register(command);
  }

  for (const command of createPublicFeatureCommands(
    registry,
    identityService,
    membershipService,
    communityService,
    commandSettingsService,
    moderationService,
    async (action) => {
      if (!adapter) throw new Error("Discord adapter is not ready");
      await adapter.sendAction(action);
    },
    undefined,
    memberDirectoryProxy
  )) {
    registry.register(command);
  }

  const commandService =
    new CommandService(
      new CommandParser(),
      registry,
      logger,
      commandSettingsService
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
    "settings.bridge.",
    options.bridgeService
      ? createCommunitySettingsInteractionHandler(
          options.bridgeService
        )
      : () => ({
          content: "Bridge unavailable"
        })
  );

  dispatcher.registerCallback(
    "account.unlink:",
    options.identityService
      ? createAccountInteractionHandler(
          options.identityService
        )
      : () => ({
          content: "Account unavailable"
        })
  );

  dispatcher.registerCallback(
    "menu.close",
    () => ({ close: true })
  );

  let adapter: DiscordAdapter | undefined;

  adapter =
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

  memberDirectory = adapter;

  const platformEventHandler = createDiscordEventHandler({
      responder: {
        id: adapter.id,
        sendAction: async (action) => { await adapter.sendAction(action); },
        answerInteraction: (interactionExternalId, text) => {
          adapter.answerInteraction(interactionExternalId, text);
        }
      },
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
        bridgeService,
      identityService:
        options.identityService,
      membershipService:
        options.membershipService,
      communityService:
        options.communityService
    })
  });
  adapter.onEvent(async (event) => {
    const externalCommunityId = event.type.startsWith("message.")
      ? event.message.community?.externalId
      : event.type.startsWith("member.")
        ? event.member.community.externalId
        : undefined;
    const community = externalCommunityId
      ? options.communityService?.findByIdentity("discord", externalCommunityId)
      : undefined;
    if (community && options.auditService) {
      let action: import("@modexa/core").AuditAction | undefined;
      let metadata: Record<string, unknown> = { platform: "discord" };
      let channelId: string | undefined;
      let messageId: string | undefined;
      switch (event.type) {
        case "message.deleted":
          action = "message.delete";
          metadata = { ...metadata, targetExternalId: event.message.author.externalId, channelExternalId: event.message.channel?.externalId, messageExternalId: event.message.externalId, content: event.message.content.slice(0, 1500) };
          channelId = event.message.channel?.externalId;
          messageId = event.message.externalId;
          break;
        case "message.updated":
          action = "message.edit";
          metadata = { ...metadata, targetExternalId: event.message.author.externalId, channelExternalId: event.message.channel?.externalId, messageExternalId: event.message.externalId, content: event.message.content.slice(0, 1500) };
          channelId = event.message.channel?.externalId;
          messageId = event.message.externalId;
          break;
        case "member.joined":
          action = "member.join";
          metadata = { ...metadata, targetExternalId: event.member.user.externalId, username: event.member.user.username ?? event.member.user.displayName };
          break;
        case "member.left":
          action = "member.leave";
          metadata = { ...metadata, targetExternalId: event.member.user.externalId, username: event.member.user.username ?? event.member.user.displayName };
          break;
        case "member.banned":
          action = "member.ban";
          metadata = { ...metadata, targetExternalId: event.member.user.externalId };
          break;
        case "member.unbanned":
          action = "member.unban";
          metadata = { ...metadata, targetExternalId: event.member.user.externalId };
          break;
      }
      if (action) options.auditService.record({
        communityId: community.id,
        action,
        ...(channelId ? { channelId } : {}),
        ...(messageId ? { messageId } : {}),
        metadata
      });
    }
    await platformEventHandler(event);
  });

  return adapter;
}
