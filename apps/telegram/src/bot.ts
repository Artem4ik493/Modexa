import { randomBytes } from "node:crypto";

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
  createModerationCommands,
  createModerationRestoreCommands,
  ModerationService,
  CommandSettingsService,
  createPublicFeatureCommands,
  createAccountInteractionHandler,
  createCommunitySettingsInteractionHandler,
  createBridgeTestInteractionHandler,
  createIdentityLinkCommand,
  BridgeService,
  type PlatformIdentityResolver,
  type CommunityService,
  type MembershipService,
  IdentityService,
  AccessControlService,
  ModexaDatabase,
  type MemberDirectory,
  type AuditService,
  type AutoModService
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
    CommandSettingsService;

  auditService?: AuditService;
  autoModService?: AutoModService;
}

export function createTelegramAdapter(
  token: string,
  logger: CoreLogger,
  options:
    CreateTelegramAdapterOptions = {}
): TelegramAdapter {
  const bot =
    new Bot(token);

  // A Telegram group administrator can generate a short-lived code that
  // a Discord community manager redeems in the Dashboard to link the group.
  // Register before the generic message handler so this command is handled
  // by this focused workflow first.
  bot.command("dashboard_link", async (ctx) => {
    const chat = ctx.chat;
    const user = ctx.from;
    const database = options.database;
    if (!database || !user || (chat.type !== "group" && chat.type !== "supergroup")) {
      await ctx.reply("Эта команда доступна только в Telegram-группе, где подключена Modexa.");
      return;
    }

    try {
      const [requester, me] = await Promise.all([
        bot.api.getChatMember(chat.id, user.id),
        bot.api.getMe()
      ]);
      const botMember = await bot.api.getChatMember(chat.id, me.id);
      const isAdmin = requester.status === "creator" || requester.status === "administrator";
      const botIsAdmin = botMember.status === "creator" || botMember.status === "administrator";
      if (!isAdmin || !botIsAdmin) {
        await ctx.reply("Для привязки нужны права администратора группы у вас и у бота Modexa.");
        return;
      }

      const now = Date.now();
      const code = randomBytes(8).toString("hex").toUpperCase();
      const current = database.getRuntimeState<Array<{
        code: string; chatId: string; chatTitle: string; requestedBy: string;
        createdAt: string; expiresAt: string;
      }>>("telegram.pending_group_links") ?? [];
      const pending = current.filter((item) => Date.parse(item.expiresAt) > now && item.chatId !== String(chat.id));
      pending.push({
        code,
        chatId: String(chat.id),
        chatTitle: chat.title,
        requestedBy: String(user.id),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 10 * 60_000).toISOString()
      });
      database.setRuntimeState("telegram.pending_group_links", pending.slice(-100));
      await ctx.reply(
        "Код привязки к Modexa: " + code +
        "\nОн действует 10 минут. Откройте Dashboard → Telegram-группы и подтвердите добавление. Можно создать отдельное Telegram-сообщество или связать группу с выбранным Discord-сообществом для Bridge."
      );
    } catch (error) {
      logger.error("telegram.group_link.request_failed", {
        chatId: String(chat.id),
        requesterId: String(user.id)
      }, error);
      await ctx.reply("Не удалось проверить права. Убедитесь, что бот является администратором группы, и повторите попытку.");
    }
  });

  // A Telegram group administrator can remove this group's Modexa links
  // directly from Telegram, without opening the Dashboard.
  bot.command("dashboard_unlink", async (ctx) => {
    const chat = ctx.chat;
    const user = ctx.from;
    const database = options.database;
    if (!database || !user || (chat.type !== "group" && chat.type !== "supergroup")) {
      await ctx.reply("Эта команда доступна только в Telegram-группе, где подключена Modexa.");
      return;
    }

    try {
      const requester = await bot.api.getChatMember(chat.id, user.id);
      const isAdmin = requester.status === "creator" || requester.status === "administrator";
      if (!isAdmin) {
        await ctx.reply("Отвязать группу может только её администратор.");
        return;
      }

      const chatId = String(chat.id);
      const identities = database.getCommunityIdentitiesSnapshot()
        .filter((identity) => identity.platform === "telegram" && identity.externalId === chatId);
      if (identities.length === 0) {
        await ctx.reply("Эта Telegram-группа не привязана к сообществу Modexa.");
        return;
      }

      const communityIds = new Set(identities.map((identity) => identity.communityId));
      const communityNames = database.getCommunitiesSnapshot()
        .filter((community) => communityIds.has(community.id))
        .map((community) => community.name);

      for (const identity of identities) {
        database.deleteCommunityIdentity(identity.communityId, "telegram", chatId);
      }

      const endpoints = database.getBridgeEndpoints().filter((endpoint) =>
        endpoint.platform === "telegram" &&
        communityIds.has(endpoint.communityId ?? "") &&
        (endpoint.communityExternalId === chatId || endpoint.channelExternalId === chatId)
      );
      for (const endpoint of endpoints) database.deleteBridgeEndpoint(endpoint.id);

      const pending = database.getRuntimeState<Array<{
        code: string; chatId: string; chatTitle: string; requestedBy: string;
        createdAt: string; expiresAt: string;
      }>>("telegram.pending_group_links") ?? [];
      database.setRuntimeState(
        "telegram.pending_group_links",
        pending.filter((item) => item.chatId !== chatId)
      );

      await ctx.reply(
        "Telegram-группа «" + (chat.title ?? chatId) + "» отвязана от Modexa." +
        (communityNames.length ? "\nСообщество: " + communityNames.join(", ") : "") +
        (endpoints.length ? "\nУдалено связанных Bridge endpoint: " + endpoints.length : "") +
        "\nЧтобы привязать группу снова, выполните /dashboard_link."
      );
    } catch (error) {
      logger.error("telegram.group_unlink.failed", {
        chatId: String(chat.id),
        requesterId: String(user.id)
      }, error);
      await ctx.reply("Не удалось отвязать группу. Попробуйте позже или обратитесь к владельцу Modexa.");
    }
  });

  const registry =
    new CommandRegistry();

  let memberDirectory:
    MemberDirectory | undefined;

  const resolveTelegramChatId = (
    communityId: string
  ): string | undefined =>
    options.communityService
      ?.getCommunityIdentities(
        communityId
      )
      .find(
        (identity) =>
          identity.platform === "telegram"
      )
      ?.externalId;

  const memberDirectoryProxy: MemberDirectory = {
    getMember(
      communityId,
      userExternalId
    ) {
      const chatId =
        resolveTelegramChatId(
          communityId
        );

      return chatId && memberDirectory
        ? memberDirectory.getMember(
            chatId,
            userExternalId
          )
        : Promise.resolve(undefined);
    },

    listMembers(
      communityId
    ) {
      const chatId =
        resolveTelegramChatId(
          communityId
        );

      return chatId && memberDirectory
        ? memberDirectory.listMembers(
            chatId
          )
        : Promise.resolve([]);
    },

    findMemberByUsername(
      communityId,
      username
    ) {
      const chatId =
        resolveTelegramChatId(
          communityId
        );

      return chatId &&
        memberDirectory?.findMemberByUsername
        ? memberDirectory.findMemberByUsername(
            chatId,
            username
          )
        : Promise.resolve(undefined);
    }
  };

  const accessControlService =
    options.accessControlService ??
    new AccessControlService(
      options.database,
      options.database
    );

  const moderationService =
    options.moderationService ??
    new ModerationService(
      accessControlService,
      options.database
    );

  const commandSettingsService =
    options.commandSettingsService ??
    new CommandSettingsService(options.database);

  const adapter =
    new TelegramAdapter(
      bot,
      logger
    );

  memberDirectory = adapter;

  createBuiltinCommands(
    registry,
    options.communityService,
    options.identityService,
    options.membershipService,
    accessControlService,
    options.database,
    options.bridgeService
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

  if (
    options.identityService &&
    options.membershipService
  ) {
    registry.register(
      createMemberCommand(
        options.identityService,
        options.membershipService,
        accessControlService,
        memberDirectoryProxy,
        logger,
        options.database
      )
    );

    registry.register(
      createMembersCommand(
        options.identityService,
        options.membershipService,
        accessControlService,
        memberDirectoryProxy,
        options.database
      )
    );
  }

  if (options.identityService && options.membershipService) {
    registry.register(
      createRoleCommand(
        options.identityService,
        options.membershipService,
        accessControlService,
        memberDirectoryProxy
      )
    );
  }

  if (
    options.identityService &&
    options.membershipService &&
    options.communityService
  ) {
    for (
      const command of createModerationCommands(
        options.identityService,
        options.membershipService,
        options.communityService,
        moderationService,
        memberDirectoryProxy,
        async (action: import("@modexa/core").AdapterAction) => { await adapter.sendAction(action); }
      )
    ) {
      registry.register(command);
    }
  }

  for (const command of createModerationRestoreCommands(
    options.identityService!,
    options.membershipService!,
    options.communityService!,
    moderationService,
    async (action) => { await adapter.sendAction(action); },
    memberDirectoryProxy
  )) {
    registry.register(command);
  }

  for (const command of createPublicFeatureCommands(
    registry,
    options.identityService!,
    options.membershipService!,
    options.communityService!,
    commandSettingsService,
    moderationService,
    async (action) => { await adapter.sendAction(action); },
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

  if (options.bridgeService) {
    dispatcher.registerCallback(
      "bridge.test.",
      createBridgeTestInteractionHandler(
        options.bridgeService,
        options.membershipService
      )
    );
  }

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

  const platformEventHandler = createTelegramEventHandler({
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
        options.bridgeService,
      identityService:
        options.identityService,
      membershipService:
        options.membershipService,
      communityService:
        options.communityService,
      autoModService: options.autoModService,
      database:
        options.database
  });
  adapter.onEvent(async (event) => {
    const externalCommunityId =
      event.type === "message.created" || event.type === "message.updated" || event.type === "message.deleted"
        ? event.message.community?.externalId
        : event.type === "member.joined" || event.type === "member.left" || event.type === "member.banned" || event.type === "member.unbanned"
          ? event.member.community.externalId
          : undefined;
    const community = externalCommunityId
      ? options.communityService?.findByIdentity("telegram", externalCommunityId)
      : undefined;
    if (community && options.auditService) {
      let action: import("@modexa/core").AuditAction | undefined;
      let metadata: Record<string, unknown> = { platform: "telegram", communityExternalId: externalCommunityId };
      let channelId: string | undefined;
      let messageId: string | undefined;
      switch (event.type) {
        case "message.deleted":
          action = "message.delete";
          metadata = { ...metadata, targetExternalId: event.message.author.externalId, channelExternalId: event.message.channel?.externalId, messageExternalId: event.message.externalId };
          channelId = event.message.channel?.externalId;
          messageId = event.message.externalId;
          break;
        case "message.updated":
          action = "message.edit";
          metadata = { ...metadata, targetExternalId: event.message.author.externalId, channelExternalId: event.message.channel?.externalId, messageExternalId: event.message.externalId };
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
