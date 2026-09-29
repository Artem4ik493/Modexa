import {
  type AdapterAction,
  type AdapterEvent,
  type PlatformAdapter,
  type PlatformChannel,
  type PlatformCommunity,
  type PlatformUser
} from "@modexa/core";

import {
  Client,
  Events,
  MessageFlags,
  type ButtonInteraction,
  type Message
} from "discord.js";

import {
  parseDiscordCustomId
} from "./interactions.js";

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

  private started = false;

  constructor(
    private readonly client: Client,
    private readonly token: string
  ) {
    this.registerHandlers();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    await this.client.login(this.token);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    await this.client.destroy();

    this.started = false;
  }

  /**
   * Discord-specific: sets the ephemeral text that
   * will be shown to the user who pressed the button.
   */
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

      return {
        platform: "discord",
        externalId,
        username: user.username,
        displayName:
          user.globalName ??
          user.username
      };
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
      // An empty list clears old buttons on edit.
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

  private registerHandlers(): void {
    this.client.on(
      Events.MessageCreate,
      async (message) => {
        if (message.author.bot) {
          return;
        }

        try {
          await this.emitEvent(
            this.createMessageEvent(
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
        if (!interaction.isButton()) {
          return;
        }

        const token =
          parseDiscordCustomId(
            interaction.customId
          );

        if (!token) {
          return;
        }

        try {
          // Discord requires an acknowledgement
          // within 3 seconds.
          await interaction.deferUpdate();
        } catch {
          return;
        }

        try {
          await this.emitEvent(
            this.createInteractionEvent(
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
                flags:
                  MessageFlags.Ephemeral
              });
            } catch {
              // The interaction may have expired.
            }
          }
        }
      }
    );
  }

  private createMessageEvent(
    message: Message
  ): AdapterEvent {
    const guild =
      message.guild;

    const channelName =
      "name" in message.channel &&
      typeof message.channel.name ===
        "string"
        ? message.channel.name
        : `Discord channel ${message.channelId}`;

    return {
      type: "message.created",

      message: {
        externalId: message.id,

        platform: "discord",

        author: {
          platform: "discord",
          externalId:
            message.author.id,
          username:
            message.author.username,
          displayName:
            message.author.globalName ??
            message.author.username
        },

        destinationExternalId:
          message.channelId,

        community: guild
          ? {
              platform: "discord",
              externalId: guild.id,
              name: guild.name
            }
          : undefined,

        channel: guild
          ? {
              platform: "discord",
              externalId:
                message.channelId,
              name: channelName
            }
          : undefined,

        content: message.content,

        createdAt:
          message.createdAt
      }
    };
  }

  private createInteractionEvent(
    interaction: ButtonInteraction,
    token: string
  ): AdapterEvent {
    const guild =
      interaction.guild;

    const channel =
      interaction.channel;

    const channelName =
      channel &&
      "name" in channel &&
      typeof channel.name === "string"
        ? channel.name
        : `Discord channel ${interaction.channelId}`;

    return {
      type: "interaction.created",

      interaction: {
        externalId: interaction.id,

        platform: "discord",

        user: {
          platform: "discord",
          externalId:
            interaction.user.id,
          username:
            interaction.user.username,
          displayName:
            interaction.user.globalName ??
            interaction.user.username
        },

        community: guild
          ? {
              platform: "discord",
              externalId: guild.id,
              name: guild.name
            }
          : undefined,

        channel: guild
          ? {
              platform: "discord",
              externalId:
                interaction.channelId,
              name: channelName
            }
          : undefined,

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