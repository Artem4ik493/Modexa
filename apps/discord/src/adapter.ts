import {
  resolveLocale,
  translate,
  type AdapterAction,
  type AdapterEvent,
  type Logger,
  type PlatformAdapter,
  type PlatformChannel,
  type PlatformCommunity,
  type PlatformUser,
  type PlatformUserRole,
  type BridgeService,
  type MemberDirectory,
  type AuditService,
  type CommunityService,
  type PlatformMemberDetails
} from "@modexa/core";

import {
  Client,
  Events,
  MessageFlags,
  PermissionsBitField,
  type ApplicationCommandDataResolvable,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type User,
  Routes
} from "discord.js";

import {
  parseDiscordCustomId
} from "./interactions.js";

import type {
  DiscordSlashCommand
} from "./slash-commands.js";

export interface DiscordAdapterOptions {
  /**
   * Slash commands to register on start.
   */
  slashCommands?: DiscordSlashCommand[];

  /**
   * When set, commands are registered on this server only
   * (instant, good for development). Otherwise they are
   * registered globally, which is required for slash
   * commands in direct messages.
   */
  guildId?: string;

  logger?: Logger;

  bridgeService?: BridgeService;
  auditService?: AuditService;
  communityService?: CommunityService;
}

export class DiscordAdapter
  implements PlatformAdapter, MemberDirectory
{
  readonly id =
    "discord-main";

  readonly platform =
    "discord" as const;

  private readonly eventHandlers: Array<
    (
      event: AdapterEvent
    ) => void | Promise<void>
  > = [];

  /**
   * Ephemeral text to show after the button press
   * has been acknowledged.
   */
  private readonly pendingAnswers =
    new Map<string, string>();

  /**
   * Slash command interactions that were deferred and
   * still wait for their reply.
   */
  private readonly pendingReplies =
    new Map<
      string,
      ChatInputCommandInteraction
    >();

  private started = false;

  constructor(
    private readonly client: Client,
    private readonly token: string,
    private readonly options: DiscordAdapterOptions = {}
  ) {
    this.registerHandlers();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    await this.client.login(this.token);

    await this.registerKnownBridgeEndpoints();

    await this.registerSlashCommands();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    await this.client.destroy();

    this.started = false;
  }

  answerInteraction(
    interactionExternalId: string,
    text: string
  ): void {
    this.pendingAnswers.set(
      interactionExternalId,
      text
    );
  }

  async sendAction(
    action: AdapterAction
  ): Promise<string | void> {
    switch (action.type) {
      case "message.send": {
        const pending =
          action.replyToExternalId
            ? this.pendingReplies.get(
                action.replyToExternalId
              )
            : undefined;

        if (pending) {
          this.pendingReplies.delete(
            pending.id
          );

          const embeds =
            this.getEmbeds(action.metadata);
          const media =
            this.getBridgeMedia(action.metadata);
          const sendContent =
            media?.type === "video"
              ? `${action.content}\n${media.url}`
              : action.content;

          const sent = await pending.editReply({
            content: sendContent,
            components:
              this.getComponents(
                action.metadata
              ) as never,
            ...(embeds.length > 0 ? { embeds } : {})
          });

          return sent.id;
        }

        const channel =
          await this.getSendableChannel(
            action.channelExternalId
          );

        const embeds =
          this.getEmbeds(action.metadata);
        const media =
          this.getBridgeMedia(action.metadata);
        const sendContent =
          media?.type === "video"
            ? `${action.content}\n${media.url}`
            : action.content;

        const sent = await channel.send({
          content: sendContent,
          components:
            this.getComponents(
              action.metadata
            ) as never,
          ...(embeds.length > 0 ? { embeds } : {})
        });

        return sent.id;
      }

      case "message.edit": {
        const channel =
          await this.getSendableChannel(
            action.channelExternalId
          );

        const message =
          await channel.messages.fetch(
            action.messageExternalId
          );

        const embeds = this.getEmbeds(action.metadata);
        await message.edit({
          content: action.content,
          components: this.getComponents(action.metadata) as never,
          ...(embeds.length > 0 ? { embeds } : { embeds: [] })
        });

        return;
      }

      case "channel.clear": {
        const channel = await this.getSendableChannel(action.channelExternalId);
        const messages = await channel.messages.fetch({ limit: Math.min(action.count, 100) });
        if (messages.size > 0 && "bulkDelete" in channel) {
          await channel.bulkDelete(messages, true);
        }
        return;
      }

      case "message.delete": {
        const channel =
          await this.getSendableChannel(
            action.channelExternalId
          );

        const message =
          await channel.messages.fetch(
            action.messageExternalId
          );

        await message.delete();

        return;
      }

      case "member.warn": {
        const guild = await this.client.guilds.fetch(action.communityExternalId);
        const actorExternalId = typeof action.metadata?.actorExternalId === "string"
          ? action.metadata.actorExternalId
          : undefined;
        const targetMember = await guild.members.fetch(action.userExternalId);
        await this.assertActorNativeHierarchy(guild, actorExternalId, targetMember);
        const target = await this.client.users.fetch(action.userExternalId);
        const targetName =
          typeof action.metadata?.targetDisplayName === "string"
            ? action.metadata.targetDisplayName
            : target.globalName ?? target.username;
        const reason = action.reason?.trim() || "Причина не указана.";
        const botMember = guild.members.me;
        const channel = guild.systemChannel;

        if (
          channel &&
          botMember &&
          channel.permissionsFor(botMember)?.has(PermissionsBitField.Flags.SendMessages)
        ) {
          await channel.send(`⚠️ ${targetName} получил предупреждение. Причина: ${reason}`);
        }

        // A member may block bot DMs; this does not invalidate the warning case.
        await target.send(
          `⚠️ Вы получили предупреждение на сервере **${guild.name}**. Причина: ${reason}`
        ).catch(() => undefined);
        return;
      }
      case "member.mute": {
        const guild = await this.client.guilds.fetch(action.communityExternalId);
        const me = guild.members.me ?? await guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          throw new Error("Discord bot is missing the Moderate Members permission");
        }
        const member = await guild.members.fetch(action.userExternalId);
        await this.assertNativeModerationHierarchy(
          guild,
          me,
          typeof action.metadata?.actorExternalId === "string"
            ? action.metadata.actorExternalId
            : undefined,
          member
        );
        if (!Number.isFinite(action.durationSeconds) || !action.durationSeconds || action.durationSeconds <= 0) {
          throw new Error("Discord mute duration must be positive");
        }
        await member.timeout(
          Math.min(action.durationSeconds * 1000, 28 * 24 * 60 * 60 * 1000),
          action.reason
        );
        return;
      }

      case "member.kick": {
        const guild = await this.client.guilds.fetch(action.communityExternalId);
        const me = guild.members.me ?? await guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.KickMembers)) {
          throw new Error("Discord bot is missing the Kick Members permission");
        }
        const member = await guild.members.fetch(action.userExternalId);
        await this.assertNativeModerationHierarchy(
          guild,
          me,
          typeof action.metadata?.actorExternalId === "string"
            ? action.metadata.actorExternalId
            : undefined,
          member
        );
        await member.kick(action.reason);
        return;
      }

      case "member.unmute": {
        const guild = await this.client.guilds.fetch(action.communityExternalId);
        const me = guild.members.me ?? await guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          throw new Error("Discord bot is missing the Moderate Members permission");
        }
        const member = await guild.members.fetch(action.userExternalId);
        await this.assertNativeModerationHierarchy(
          guild,
          me,
          typeof action.metadata?.actorExternalId === "string"
            ? action.metadata.actorExternalId
            : undefined,
          member
        );
        if (member.communicationDisabledUntilTimestamp === null) {
          return;
        }
        await member.timeout(null);
        return;
      }

      case "member.unban": {
        const guild = await this.client.guilds.fetch(action.communityExternalId);
        const me = guild.members.me ?? await guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          throw new Error("Discord bot is missing the Ban Members permission");
        }
        await guild.bans.remove(action.userExternalId);
        return;
      }

      case "member.ban": {
        const guild = await this.client.guilds.fetch(action.communityExternalId);
        const me = guild.members.me ?? await guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          throw new Error("Discord bot is missing the Ban Members permission");
        }
        const member = await guild.members.fetch(action.userExternalId);
        await this.assertNativeModerationHierarchy(
          guild,
          me,
          typeof action.metadata?.actorExternalId === "string"
            ? action.metadata.actorExternalId
            : undefined,
          member
        );
        await guild.members.ban(action.userExternalId, { reason: action.reason });
        return;
      }
    }
  }

  private async assertNativeModerationHierarchy(
    guild: Guild,
    botMember: GuildMember,
    actorExternalId: string | undefined,
    target: GuildMember
  ): Promise<void> {
    if (target.id === guild.ownerId) {
      throw new Error("Discord moderation cannot target the server owner");
    }

    if (target.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
      throw new Error("Discord bot role hierarchy: the bot must have a higher role than the target");
    }

    await this.assertActorNativeHierarchy(guild, actorExternalId, target);
  }

  private async assertActorNativeHierarchy(
    guild: Guild,
    actorExternalId: string | undefined,
    target: GuildMember
  ): Promise<void> {
    if (target.id === guild.ownerId) {
      throw new Error("Discord moderation cannot target the server owner");
    }

    if (!actorExternalId) {
      throw new Error("Cannot verify the moderator's Discord identity for role hierarchy");
    }

    if (actorExternalId === target.id) {
      throw new Error("You cannot moderate yourself");
    }

    if (actorExternalId === guild.ownerId) {
      return;
    }

    const actor = await guild.members.fetch(actorExternalId);
    if (actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
      throw new Error("Discord role hierarchy: the moderator must have a higher role than the target");
    }
  }

  private async fetchMemberFromApi(
    guildId: string,
    userId: string
  ): Promise<{
    id: string;
    username: string;
    globalName?: string;
    avatar?: string | null;
    roles: string[];
    joinedAt?: Date;
    pending?: boolean;
  } | undefined> {
    try {
      const member =
        (await this.client.rest.get(
          Routes.guildMember(
            guildId,
            userId
          )
        )) as {
          user?: {
            id: string;
            username: string;
            global_name?: string | null;
            avatar?: string | null;
            bot?: boolean;
          };
          roles?: string[];
          joined_at?: string | null;
          pending?: boolean;
        };

      if (!member.user || member.user.bot) {
        return undefined;
      }

      return {
        id: member.user.id,
        username: member.user.username,
        globalName:
          member.user.global_name ??
          undefined,
        avatar:
          member.user.avatar ??
          null,
        roles:
          member.roles ?? [],
        joinedAt:
          member.joined_at
            ? new Date(member.joined_at)
            : undefined,
        pending: member.pending
      };
    } catch {
      return undefined;
    }
  }

  private getDiscordRoleNames(
    guild: Guild,
    roleIds: string[]
  ): {
    names: string[];
    isAdmin: boolean;
  } {
    const names: string[] = [];
    let isAdmin = false;

    for (const roleId of roleIds) {
      const role =
        guild.roles.cache.get(roleId);

      if (!role) {
        continue;
      }

      names.push(role.name);

      if (
        role.permissions.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        isAdmin = true;
      }
    }

    return {
      names,
      isAdmin
    };
  }

  private async toPlatformMemberDetailsFromApi(
    guild: Guild,
    data: {
      id: string;
      username: string;
      globalName?: string;
      avatar?: string | null;
      roles: string[];
      joinedAt?: Date;
      pending?: boolean;
    }
  ): Promise<PlatformMemberDetails> {
    const roleData =
      this.getDiscordRoleNames(
        guild,
        data.roles
      );

    const platformRole =
      guild.ownerId === data.id
        ? "owner"
        : roleData.isAdmin
          ? "admin"
          : "member";

    const avatarUrl =
      data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=512`
        : undefined;

    return {
      user: {
        platform: "discord",
        externalId: data.id,
        username: data.username,
        displayName:
          data.globalName ??
          data.username,
        avatarUrl,
        platformRole
      },
      joinedAt: data.joinedAt,
      roles: roleData.names,
      roleMentions: data.roles
        .map((roleId) => guild.roles.cache.get(roleId))
        .filter((role): role is NonNullable<typeof role> => Boolean(role))
        .map((role) => `<@&${role.id}>`),
      status: data.pending
        ? "pending"
        : platformRole,
      isMember: true
    };
  }

  async getModerationState(
    communityExternalId: string,
    userExternalId: string
  ): Promise<{ isMuted: boolean; mutedUntil?: Date } | undefined> {
    try {
      const guild = await this.client.guilds.fetch(communityExternalId);
      const member = await guild.members.fetch(userExternalId);
      const mutedUntil = member.communicationDisabledUntil ?? undefined;
      return {
        isMuted: Boolean(mutedUntil && mutedUntil.getTime() > Date.now()),
        ...(mutedUntil ? { mutedUntil } : {})
      };
    } catch {
      // Unknown is not the same as unmuted: do not reconcile a case when
      // Discord could not confirm the member's current state.
      return undefined;
    }
  }

  async getMember(
    communityExternalId: string,
    userExternalId: string
  ): Promise<PlatformMemberDetails | undefined> {
    const guild =
      await this.client.guilds.fetch(
        communityExternalId
      );

    try {
      await guild.roles.fetch();
    } catch {
      // Continue with cached roles if role fetch fails.
    }

    const data =
      await this.fetchMemberFromApi(
        communityExternalId,
        userExternalId
      );

    if (data) {
      return this.toPlatformMemberDetailsFromApi(
        guild,
        data
      );
    }

    try {
      const user =
        await this.client.users.fetch(
          userExternalId
        );

      if (user.bot) {
        return undefined;
      }

      return {
        user: this.toPlatformUser(
          user,
          undefined,
          "member"
        ),
        roles: [],
        status: "not_member",
        isMember: false
      };
    } catch {
      return undefined;
    }
  }

  async findMemberByUsername(
    communityExternalId: string,
    username: string
  ): Promise<PlatformMemberDetails | undefined> {
    const normalized = username.replace(/^@/, "").trim().toLowerCase();
    if (!normalized) return undefined;

    const guild = await this.client.guilds.fetch(communityExternalId);

    try {
      await guild.roles.fetch();
    } catch {
      // Continue with cached roles if role fetch fails.
    }

    // discord.js uses the official guild member search endpoint here.
    // This works even when the target has never sent a message to the bot,
    // provided the application has the Guild Members privileged intent.
    try {
      const matches = await guild.members.search({
        query: normalized,
        limit: 10
      });

      const exact = [...matches.values()].find((member) =>
        !member.user.bot &&
        [member.user.username, member.user.globalName]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase() === normalized)
      );

      if (exact) {
        const data = await this.fetchMemberFromApi(
          communityExternalId,
          exact.id
        );

        if (data) {
          return this.toPlatformMemberDetailsFromApi(guild, data);
        }

        return this.toPlatformMemberDetailsFromApi(guild, {
          id: exact.id,
          username: exact.user.username,
          globalName: exact.user.globalName ?? undefined,
          avatar: exact.user.avatar,
          roles: [...exact.roles.cache.keys()],
          joinedAt: exact.joinedAt ?? undefined,
          pending: exact.pending
        });
      }
    } catch {
      // Fall back to the REST implementation below.
    }

    try {
      const searchQuery = new URLSearchParams({ query: normalized, limit: "10" });
      const matches = await this.client.rest.get(
        Routes.guildMembersSearch(communityExternalId),
        { query: searchQuery }
      ) as Array<{
        user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
        roles?: string[];
        joined_at?: string | null;
        pending?: boolean;
      }>;

      const match = matches.find((item) =>
        item.user &&
        !item.user.bot &&
        [item.user.username, item.user.global_name]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase() === normalized)
      );

      if (match?.user) {
        return this.toPlatformMemberDetailsFromApi(guild, {
          id: match.user.id,
          username: match.user.username,
          globalName: match.user.global_name ?? undefined,
          avatar: match.user.avatar ?? null,
          roles: match.roles ?? [],
          joinedAt: match.joined_at ? new Date(match.joined_at) : undefined,
          pending: match.pending
        });
      }
    } catch {
      // The bot may not have the privileged Guild Members intent.
    }

    return undefined;
  }

  async listMembers(
    communityExternalId: string
  ): Promise<PlatformMemberDetails[]> {
    const guild =
      await this.client.guilds.fetch(
        communityExternalId
      );

    const result: PlatformMemberDetails[] =
      [];

    let after: string | undefined;

    do {
      const query = new URLSearchParams({
        limit: "1000"
      });

      if (after) {
        query.set("after", after);
      }

      const members =
        (await this.client.rest.get(
          Routes.guildMembers(
            communityExternalId
          ),
          { query }
        )) as Array<{
          user?: {
            id: string;
            username: string;
            global_name?: string | null;
            avatar?: string | null;
            bot?: boolean;
          };
          roles?: string[];
          joined_at?: string | null;
          pending?: boolean;
        }>;

      if (members.length === 0) {
        break;
      }

      for (const member of members) {
        if (!member.user || member.user.bot) {
          continue;
        }

        result.push(
          await this.toPlatformMemberDetailsFromApi(
            guild,
            {
              id: member.user.id,
              username:
                member.user.username,
              globalName:
                member.user.global_name ??
                undefined,
              avatar:
                member.user.avatar ??
                null,
              roles:
                member.roles ?? [],
              joinedAt:
                member.joined_at
                  ? new Date(
                      member.joined_at
                    )
                  : undefined,
              pending:
                member.pending
            }
          )
        );
      }

      after =
        members.at(-1)?.user?.id;
    } while (after);

    return result;
  }

  async resolveUser(
    externalId: string
  ): Promise<
    PlatformUser | undefined
  > {
    try {
      const user =
        await this.client.users.fetch(
          externalId
        );

      return this.toPlatformUser(user);
    } catch {
      return undefined;
    }
  }

  async resolveCommunity(
    externalId: string
  ): Promise<
    PlatformCommunity | undefined
  > {
    try {
      const guild =
        await this.client.guilds.fetch(
          externalId
        );

      return {
        platform: "discord",
        externalId,
        name: guild.name
      };
    } catch {
      return undefined;
    }
  }

  async resolveChannel(
    externalId: string
  ): Promise<
    PlatformChannel | undefined
  > {
    try {
      const channel =
        await this.client.channels.fetch(
          externalId
        );

      if (
        !channel ||
        channel.isDMBased()
      ) {
        return undefined;
      }

      return {
        platform: "discord",
        externalId,
        name:
          "name" in channel &&
          typeof channel.name === "string"
            ? channel.name
            : `Discord channel ${externalId}`
      };
    } catch {
      return undefined;
    }
  }

  onEvent(
    handler: (
      event: AdapterEvent
    ) => void | Promise<void>
  ): void {
    this.eventHandlers.push(
      handler
    );
  }

  private async registerKnownBridgeEndpoints(): Promise<void> {
    const bridgeService =
      this.options.bridgeService;

    if (!bridgeService) {
      return;
    }

    const guilds =
      await this.client.guilds.fetch();

    for (const oauthGuild of guilds.values()) {
      const guild =
        this.client.guilds.cache.get(
          oauthGuild.id
        ) ??
        await this.client.guilds.fetch(
          oauthGuild.id
        );

      let channels;

      try {
        channels =
          await guild.channels.fetch();
      } catch {
        channels =
          guild.channels.cache;
      }

      for (const channel of channels.values()) {
        if (
          !channel ||
          !channel.isTextBased() ||
          channel.isDMBased() ||
          !("send" in channel) ||
          typeof channel.name !== "string"
        ) {
          continue;
        }

        bridgeService.registerEndpoint({
          platform: "discord",
          communityExternalId:
            guild.id,
          communityName:
            guild.name,
          channelExternalId:
            channel.id,
          channelName:
            channel.name
        });
      }
    }
  }

  private async registerBridgeGuildEndpoints(
    guild: Guild
  ): Promise<void> {
    const bridgeService =
      this.options.bridgeService;

    if (!bridgeService) {
      return;
    }

    let channels;

    try {
      channels =
        await guild.channels.fetch();
    } catch {
      channels =
        guild.channels.cache;
    }

    for (const channel of channels.values()) {
      if (
        !channel ||
        !channel.isTextBased() ||
        channel.isDMBased() ||
        !("send" in channel) ||
        typeof channel.name !== "string"
      ) {
        continue;
      }

      bridgeService.registerEndpoint({
        platform: "discord",
        communityExternalId:
          guild.id,
        communityName:
          guild.name,
        channelExternalId:
          channel.id,
        channelName:
          channel.name
      });
    }
  }

  private waitUntilReady(): Promise<void> {
    if (this.client.isReady()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.client.once(
        Events.ClientReady,
        () => resolve()
      );
    });
  }

  private async registerSlashCommands(): Promise<void> {
    const commands =
      this.options.slashCommands ?? [];

    if (commands.length === 0) {
      return;
    }

    const { guildId, logger } =
      this.options;

    try {
      await this.waitUntilReady();

      const application =
        this.client.application;

      if (!application) {
        throw new Error(
          "Discord application is not available"
        );
      }

      const data =
        commands as unknown as ApplicationCommandDataResolvable[];

      if (guildId) {
        await application.commands.set(
          data,
          guildId
        );
      } else {
        await application.commands.set(
          data
        );
      }

      logger?.info(
        "discord.commands.registered",
        {
          adapterId: this.id,
          platform: this.platform,
          count: commands.length,
          scope: guildId
            ? "guild"
            : "global"
        }
      );
    } catch (error) {
      logger?.error(
        "discord.commands.register_failed",
        {
          adapterId: this.id,
          platform: this.platform,
          scope: guildId
            ? "guild"
            : "global"
        },
        error
      );
    }
  }

  private getEmbeds(
    metadata:
      | Record<string, unknown>
      | undefined
  ): Array<import("discord.js").APIEmbed> {
    const discord = metadata?.discord;
    if (!discord || typeof discord !== "object") return [];

    const embedValue = "embed" in discord ? discord.embed : undefined;
    const imageUrl = "imageUrl" in discord && typeof discord.imageUrl === "string" ? discord.imageUrl : undefined;
    const media =
      "media" in discord &&
      discord.media &&
      typeof discord.media === "object"
        ? discord.media as { type?: string; url?: string }
        : undefined;

    if (!embedValue || typeof embedValue !== "object") {
      if (imageUrl) return [{ image: { url: imageUrl } }];
      if (media?.url && (media.type === "image" || media.type === "animation")) {
        return [{ image: { url: media.url } }];
      }
      return [];
    }

    const source = embedValue as Record<string, unknown>;
    const embed: import("discord.js").APIEmbed = {};
    if (typeof source.title === "string") embed.title = source.title;
    if (typeof source.description === "string") embed.description = source.description;
    if (typeof source.color === "number") embed.color = source.color;
    if (Array.isArray(source.fields)) {
      embed.fields = source.fields as import("discord.js").APIEmbedField[];
    }
    if (typeof source.footer === "string") embed.footer = { text: source.footer };
    if (typeof source.thumbnailUrl === "string") embed.thumbnail = { url: source.thumbnailUrl };
    if (typeof source.imageUrl === "string") embed.image = { url: source.imageUrl };
    if (imageUrl && !embed.image) embed.image = { url: imageUrl };
    if (!embed.image && media?.url && (media.type === "image" || media.type === "animation")) {
      embed.image = { url: media.url };
    }
    return Object.keys(embed).length > 0 ? [embed] : [];
  }

  private getBridgeMedia(
    metadata:
      | Record<string, unknown>
      | undefined
  ): { type: string; url: string } | undefined {
    const discord = metadata?.discord;
    if (!discord || typeof discord !== "object" || !("media" in discord)) {
      return undefined;
    }

    const media = discord.media;
    if (
      !media ||
      typeof media !== "object" ||
      !("url" in media) ||
      typeof media.url !== "string" ||
      !("type" in media) ||
      typeof media.type !== "string"
    ) {
      return undefined;
    }

    return {
      type: media.type,
      url: media.url
    };
  }

  private getComponents(
    metadata:
      | Record<string, unknown>
      | undefined
  ): unknown[] {
    const discord =
      metadata?.discord;

    if (
      !discord ||
      typeof discord !== "object" ||
      !("components" in discord) ||
      !Array.isArray(discord.components)
    ) {
      return [];
    }

    return discord.components;
  }

  private async getSendableChannel(
    channelId: string
  ) {
    const channel =
      await this.client.channels.fetch(
        channelId
      );

    if (
      !channel ||
      !channel.isTextBased() ||
      !("send" in channel)
    ) {
      throw new Error(
        `Discord channel "${channelId}" is not a text channel`
      );
    }

    return channel;
  }

  private hasAdministratorPermission(
    permissions:
      | PermissionsBitField
      | string
      | undefined
  ): boolean {
    if (!permissions) {
      return false;
    }

    if (
      permissions instanceof PermissionsBitField
    ) {
      return permissions.has(
        PermissionsBitField.Flags.Administrator
      );
    }

    try {
      const value =
        BigInt(permissions);

      return (
        (value &
          PermissionsBitField.Flags.Administrator) !==
        0n
      );
    } catch {
      return false;
    }
  }

  private async resolvePlatformRole(
    guild: Guild | null,
    userId: string,
    member?: {
      permissions?: PermissionsBitField | string;
    } | null
  ): Promise<PlatformUserRole> {
    if (!guild) {
      return "member";
    }

    if (
      guild.ownerId === userId
    ) {
      return "owner";
    }

    if (
      this.hasAdministratorPermission(
        member?.permissions
      )
    ) {
      return "admin";
    }

    try {
      const resolvedMember =
        await guild.members.fetch(
          userId
        );

      if (
        this.hasAdministratorPermission(
          resolvedMember.permissions
        )
      ) {
        return "admin";
      }
    } catch {
      // Fall through to the least privileged role.
    }

    return "member";
  }

  private toPlatformUser(
    user: User,
    locale?: string,
    platformRole?: PlatformUserRole
  ): PlatformUser {
    return {
      platform: "discord",
      externalId: user.id,
      username: user.username,
      displayName:
        user.globalName ??
        user.username,
      avatarUrl:
        user.displayAvatarURL({
          extension: "png",
          size: 512
        }),
      locale,
      platformRole
    };
  }

  private createPlace(
    guild: Guild | null,
    channelId: string,
    channel: unknown
  ): {
    community?: PlatformCommunity;
    channel?: PlatformChannel;
  } {
    if (!guild) {
      return {};
    }

    const name =
      typeof channel === "object" &&
      channel !== null &&
      typeof (
        channel as { name?: unknown }
      ).name === "string"
        ? (channel as { name: string })
            .name
        : `Discord channel ${channelId}`;

    return {
      community: {
        platform: "discord",
        externalId: guild.id,
        name: guild.name
      },
      channel: {
        platform: "discord",
        externalId: channelId,
        name
      }
    };
  }

  private async createMessageEvent(
    message: Message
  ): Promise<Extract<AdapterEvent, { type: "message.created" }>> {
    const place = this.createPlace(
      message.guild,
      message.channelId,
      message.channel
    );

    const platformRole =
      await this.resolvePlatformRole(
        message.guild,
        message.author.id,
        message.member
      );

    const attachment =
      message.attachments.find((item) => Boolean(item.url));

    const bridgeMedia =
      attachment?.url
        ? attachment.contentType?.startsWith("video/")
          ? {
              type: "video" as const,
              url: attachment.url
            }
          : attachment.contentType === "image/gif" ||
              attachment.url.toLowerCase().includes(".gif")
            ? {
                type: "animation" as const,
                url: attachment.url
              }
            : attachment.contentType?.startsWith("image/")
              ? {
                  type: "image" as const,
                  url: attachment.url
                }
              : undefined
        : undefined;

    return {
      type: "message.created",

      message: {
        externalId: message.id,

        platform: "discord",

        author: this.toPlatformUser(
          message.author,
          message.guild ? undefined : undefined,
          platformRole
        ),

        destinationExternalId:
          message.channelId,

        community: place.community,

        channel: place.channel,

        replyTo:
          message.mentions.repliedUser
            ? {
                platform: "discord",
                externalId:
                  message.mentions.repliedUser.id,
                username:
                  message.mentions.repliedUser.username,
                displayName:
                  message.mentions.repliedUser.globalName ??
                  message.mentions.repliedUser.username
              }
            : undefined,

        content: message.content,

        createdAt:
          message.createdAt,

        metadata: {
          ...(bridgeMedia ? { bridgeMedia } : {}),
          mentionCount: message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0),
          authorRoleIds: message.member ? [...message.member.roles.cache.keys()].filter((roleId) => roleId !== message.guild?.id) : []
        }
      }
    };
  }

  private async createCommandEvent(
    interaction: ChatInputCommandInteraction
  ): Promise<AdapterEvent> {
    const place = this.createPlace(
      interaction.guild,
      interaction.channelId,
      interaction.channel
    );

    const platformRole =
      await this.resolvePlatformRole(
        interaction.guild,
        interaction.user.id,
        interaction.member &&
        "permissions" in interaction.member
          ? interaction.member
          : undefined
      );

    const args = this.readSlashCommandArguments(interaction);

    return {
      type: "command.invoked",

      invocation: {
        externalId: interaction.id,

        platform: "discord",

        user: this.toPlatformUser(
          interaction.user,
          interaction.locale,
          platformRole
        ),

        community: place.community,

        channel: place.channel,

        destinationExternalId:
          interaction.channelId,

        name: interaction.commandName,

        args,

        createdAt:
          interaction.createdAt
      }
    };
  }

  private readSlashCommandArguments(
    interaction: ChatInputCommandInteraction
  ): string[] {
    const command = interaction.commandName;
    const options = interaction.options;

    const userCommands = new Set([
      "member", "user", "profile", "warn", "mute", "kick", "ban",
      "unmute", "unban", "warnings", "warns", "mutes", "mute-list",
      "modhistory", "resetwarns", "role"
    ]);

    if (userCommands.has(command)) {
      const target = options.getUser("user");
      const args = target ? [target.id] : [];

      if (command === "mute") {
        const duration = options.getString("duration");
        if (duration) args.push(duration);
      }

      if (command === "role") {
        const role = options.getString("role");
        if (role) args.push(role);
      }

      if (["warn", "mute", "kick", "ban"].includes(command)) {
        const reason = options.getString("reason");
        if (reason) args.push(reason);
      }

      return args;
    }

    if (["remwarn", "remwarning", "case", "modcase"].includes(command)) {
      const caseId = options.getString("case");
      return caseId ? [caseId] : [];
    }

    if (command === "command") {
      return [
        options.getString("command"),
        options.getString("state")
      ].filter((value): value is string => Boolean(value));
    }

    if (command === "clear") {
      const count = options.getInteger("count");
      return count === null ? [] : [String(count)];
    }

    if (command === "members") {
      const page = options.getInteger("page");
      return page === null ? [] : [String(page)];
    }

    return [];
  }

  private async createInteractionEvent(
    interaction: ButtonInteraction,
    token: string
  ): Promise<AdapterEvent> {
    const place = this.createPlace(
      interaction.guild,
      interaction.channelId,
      interaction.channel
    );

    const platformRole =
      await this.resolvePlatformRole(
        interaction.guild,
        interaction.user.id,
        interaction.member &&
        "permissions" in interaction.member
          ? interaction.member
          : undefined
      );

    return {
      type: "interaction.created",

      interaction: {
        externalId: interaction.id,

        platform: "discord",

        user: this.toPlatformUser(
          interaction.user,
          interaction.locale,
          platformRole
        ),

        community: place.community,

        channel: place.channel,

        destinationExternalId:
          interaction.channelId,

        messageExternalId:
          interaction.message.id,

        token,

        createdAt: new Date(),

        metadata: {
          customId:
            interaction.customId
        }
      }
    };
  }

  private registerHandlers(): void {
    this.client.on(
      Events.GuildCreate,
      (guild) => {
        void this.registerBridgeGuildEndpoints(
          guild
        );
      }
    );

    this.client.on(
      Events.ChannelCreate,
      (channel) => {
        if (
          !channel.isTextBased() ||
          channel.isDMBased() ||
          !("send" in channel) ||
          typeof channel.name !== "string"
        ) {
          return;
        }

        const bridgeService =
          this.options.bridgeService;

        if (!bridgeService) {
          return;
        }

        bridgeService.registerEndpoint({
          platform: "discord",
          communityExternalId:
            channel.guildId,
          communityName:
            channel.guild.name,
          channelExternalId:
            channel.id,
          channelName:
            channel.name
        });
      }
    );

    this.client.on(
      Events.GuildMemberUpdate,
      async (oldMember, newMember) => {
        const community = this.options.communityService?.findByIdentity("discord", newMember.guild.id);
        const audit = this.options.auditService;
        if (!community || !audit) return;

        const oldRoles = oldMember.roles.cache
          .filter((role) => role.id !== newMember.guild.id)
          .map((role) => role.id)
          .sort();
        const newRoles = newMember.roles.cache
          .filter((role) => role.id !== newMember.guild.id)
          .map((role) => role.id)
          .sort();
        const addedRoles = newRoles.filter((roleId) => !oldRoles.includes(roleId));
        const removedRoles = oldRoles.filter((roleId) => !newRoles.includes(roleId));

        if (addedRoles.length || removedRoles.length) {
          audit.record({
            communityId: community.id,
            action: "member.roles",
            metadata: {
              platform: "discord",
              targetExternalId: newMember.id,
              username: newMember.user.username,
              addedRoleIds: addedRoles,
              removedRoleIds: removedRoles
            }
          });
        }

        if (oldMember.nickname !== newMember.nickname) {
          audit.record({
            communityId: community.id,
            action: "member.nickname",
            metadata: {
              platform: "discord",
              targetExternalId: newMember.id,
              username: newMember.user.username,
              previousNickname: oldMember.nickname,
              nickname: newMember.nickname
            }
          });
        }
      }
    );

    this.client.on(
      Events.GuildMemberAdd,
      async (member) => {
        if (member.user.bot) return;

        await this.emitEvent({
          type: "member.joined",
          member: {
            externalId: member.id,
            platform: "discord",
            user: this.toPlatformUser(
              member.user,
              undefined,
              member.id === member.guild.ownerId
                ? "owner"
                : member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                  )
                  ? "admin"
                  : "member"
            ),
            community: {
              platform: "discord",
              externalId: member.guild.id,
              name: member.guild.name
            },
            createdAt: new Date()
          }
        });
      }
    );

    this.client.on(
      Events.GuildMemberRemove,
      async (member) => {
        if (member.user.bot) return;

        await this.emitEvent({
          type: "member.left",
          member: {
            externalId: member.id,
            platform: "discord",
            user: this.toPlatformUser(
              member.user
            ),
            community: {
              platform: "discord",
              externalId: member.guild.id,
              name: member.guild.name
            },
            createdAt: new Date()
          }
        });
      }
    );

    this.client.on(
      Events.GuildBanAdd,
      async (ban) => {
        if (ban.user.bot) return;

        const guild = ban.guild;

        await this.emitEvent({
          type: "member.banned",
          member: {
            externalId: ban.user.id,
            platform: "discord",
            user: this.toPlatformUser(
              ban.user
            ),
            community: {
              platform: "discord",
              externalId: guild.id,
              name: guild.name
            },
            createdAt: new Date()
          }
        });
      }
    );

    this.client.on(
      Events.GuildBanRemove,
      async (ban) => {
        if (ban.user.bot) return;

        await this.emitEvent({
          type: "member.unbanned",
          member: {
            externalId: ban.user.id,
            platform: "discord",
            user: this.toPlatformUser(ban.user),
            community: {
              platform: "discord",
              externalId: ban.guild.id,
              name: ban.guild.name
            },
            createdAt: new Date()
          }
        });
      }
    );

    this.client.on(
      Events.MessageCreate,
      async (message) => {
        if (message.author.bot) return;

        try {
          await this.emitEvent(
            await this.createMessageEvent(message)
          );
        } catch {
          // The application handler logs its own failures.
        }
      }
    );

    this.client.on(
      Events.MessageUpdate,
      async (_oldMessage, message) => {
        if (message.author?.bot) return;

        try {
          const resolved: Message = message.partial
            ? await message.fetch()
            : message;

          await this.emitEvent(
            await this.createMessageEvent(resolved)
              .then((event) => ({
                ...event,
                type: "message.updated" as const
              }))
          );
        } catch {
          // Partials/deleted messages may be unavailable.
        }
      }
    );

    this.client.on(
      Events.MessageDelete,
      async (message) => {
        if (!message.id) return;

        try {
          if (message.partial) {
            try {
              const resolved = await message.fetch();
              if (resolved.author.bot) return;

              await this.emitEvent({
                type: "message.deleted",
                message: {
                  ...(await this.createMessageEvent(resolved)).message,
                  content: resolved.content
                }
              });
            } catch {
              // A partial deleted message may no longer be fetchable.
            }
          } else {
            if (message.author.bot) return;

            await this.emitEvent({
              type: "message.deleted",
              message: {
                ...(await this.createMessageEvent(message)).message,
                content: message.content
              }
            });
          }
        } catch {
          // A deleted/partial message may no longer be fetchable.
        }
      }
    );
    this.client.on(
      Events.InteractionCreate,
      async (interaction) => {
        if (
          interaction.isChatInputCommand()
        ) {
          await this.handleSlashCommand(
            interaction
          );

          return;
        }

        if (!interaction.isButton()) {
          return;
        }

        await this.handleButton(
          interaction
        );
      }
    );
  }

  private async handleSlashCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      await interaction.deferReply();
    } catch {
      return;
    }

    this.pendingReplies.set(
      interaction.id,
      interaction
    );

    try {
      await this.emitEvent(
        await this.createCommandEvent(
          interaction
        )
      );
    } catch {
      // See MessageCreate handler.
    } finally {
      const pending =
        this.pendingReplies.get(
          interaction.id
        );

      if (pending) {
        this.pendingReplies.delete(
          interaction.id
        );

        try {
          await pending.editReply({
            content:
              this.pendingAnswers.get(
                interaction.id
              ) ??
              translate(
                "interaction.failed",
                undefined,
                resolveLocale(
                  interaction.locale
                )
              )
          });
        } catch {
          // The interaction may have expired.
        }
      }

      this.pendingAnswers.delete(
        interaction.id
      );
    }
  }

  private async handleButton(
    interaction: ButtonInteraction
  ): Promise<void> {
    const token =
      parseDiscordCustomId(
        interaction.customId
      );

    if (!token) {
      return;
    }

    try {
      await interaction.deferUpdate();
    } catch {
      return;
    }

    try {
      await this.emitEvent(
        await this.createInteractionEvent(
          interaction,
          token
        )
      );
    } catch {
      // See MessageCreate handler.
    } finally {
      const text =
        this.pendingAnswers.get(
          interaction.id
        );

      this.pendingAnswers.delete(
        interaction.id
      );

      if (text) {
        try {
          await interaction.followUp({
            content: text,
            flags: MessageFlags.Ephemeral
          });
        } catch {
          // The interaction may have expired.
        }
      }
    }
  }

  private async emitEvent(
    event: AdapterEvent
  ): Promise<void> {
    for (
      const handler of
        this.eventHandlers
    ) {
      await handler(event);
    }
  }
}