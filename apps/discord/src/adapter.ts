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
  type BridgeService
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
  type Message,
  type User
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
}

export class DiscordAdapter
  implements PlatformAdapter
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
  ): Promise<void> {
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

          await pending.editReply({
            content: action.content,
            components:
              this.getComponents(
                action.metadata
              ) as never
          });

          return;
        }

        const channel =
          await this.getSendableChannel(
            action.channelExternalId
          );

        await channel.send({
          content: action.content,
          components:
            this.getComponents(
              action.metadata
            ) as never
        });

        return;
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

        await message.edit({
          content: action.content,
          components:
            this.getComponents(
              action.metadata
            ) as never
        });

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

      case "member.warn":
        throw new Error(
          "Discord member.warn action is not implemented yet"
        );

      case "member.mute":
        throw new Error(
          "Discord member.mute action is not implemented yet"
        );

      case "member.kick":
        throw new Error(
          "Discord member.kick action is not implemented yet"
        );

      case "member.ban": {
        const guild =
          await this.client.guilds.fetch(
            action.communityExternalId
          );

        await guild.members.ban(
          action.userExternalId,
          { reason: action.reason }
        );

        return;
      }
    }
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
  ): Promise<AdapterEvent> {
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

    return {
      type: "message.created",

      message: {
        externalId: message.id,

        platform: "discord",

        author: this.toPlatformUser(
          message.author,
          undefined,
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
          message.createdAt
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

        args: [],

        createdAt:
          interaction.createdAt
      }
    };
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
      Events.MessageCreate,
      async (message) => {
        if (message.author.bot) {
          return;
        }

        try {
          await this.emitEvent(
            await this.createMessageEvent(
              message
            )
          );
        } catch {
          // The application handler logs its
          // own failures. Never crash the process.
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