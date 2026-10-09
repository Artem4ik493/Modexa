import {
  type AdapterAction,
  type AdapterEvent,
  type AdapterMessageCreatedEvent,
  type PlatformAdapter,
  type PlatformChannel,
  type PlatformCommunity,
  type PlatformUser,
  type PlatformUserRole,
  type MemberDirectory,
  type PlatformMemberDetails,
  type Logger
} from "@modexa/core";

import {
  Bot,
  GrammyError,
  InlineKeyboard,
  type Context
} from "grammy";

import {
  parseTelegramCallbackData
} from "./interactions.js";

function normalizeTelegramMarkdown(content: string): string {
  return content
    .replace(/^#{1,6}\\s+(.+)$/gm, "*$1*")
    .replace(/\\*\\*(.+?)\\*\\*/g, "*$1*");
}

function isMessageNotModified(
  error: unknown
): boolean {
  return (
    error instanceof GrammyError &&
    error.description.includes(
      "message is not modified"
    )
  );
}

export class TelegramAdapter
  implements PlatformAdapter, MemberDirectory
{
  readonly id =
    "telegram-main";

  readonly platform =
    "telegram" as const;

  private readonly eventHandlers: Array<
    (
      event: AdapterEvent
    ) => void | Promise<void>
  > = [];

  /**
   * Text to show on a callback query when it is
   * answered. Set by the application while the
   * interaction event is being processed.
   */
  private readonly pendingAnswers =
    new Map<string, string>();

  private started = false;

  private readonly recentMessageIds = new Map<string, number[]>();

  constructor(
    private readonly bot: Bot,
    private readonly logger?: Logger
  ) {
    this.registerHandlers();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    await this.bot.start({
      allowed_updates: [
        "message",
        "edited_message",
        "callback_query",
        "chat_member"
      ]
    });
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.bot.stop();

    this.started = false;
  }

  /**
   * Telegram-specific: sets the toast text that will
   * be shown when the callback query is answered.
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
  ): Promise<string | void> {
    switch (action.type) {
      case "message.send": {
        const replyMarkup =
          this.getReplyMarkup(
            action.metadata
          );

        const imageUrl =
          this.getImageUrl(
            action.metadata
          );

        const media =
          action.metadata?.telegram &&
          typeof action.metadata.telegram === "object" &&
          "media" in action.metadata.telegram &&
          action.metadata.telegram.media &&
          typeof action.metadata.telegram.media === "object"
            ? action.metadata.telegram.media as { type?: string; url?: string }
            : undefined;

        const parseMode = this.getParseMode(action.metadata);
        const rawContent = this.getPanelContent(action.content, action.metadata);
        const content = parseMode ? normalizeTelegramMarkdown(rawContent) : rawContent;

        if (media?.url && media.type === "animation") {
          const sent = await this.bot.api.sendAnimation(
            Number(action.channelExternalId),
            media.url,
            {
              caption: content,
              ...(parseMode ? { parse_mode: parseMode } : {}),
              ...(replyMarkup ? { reply_markup: replyMarkup } : {})
            }
          );
          return String(sent.message_id);
        }

        if (media?.url && media.type === "video") {
          const sent = await this.bot.api.sendVideo(
            Number(action.channelExternalId),
            media.url,
            {
              caption: content,
              ...(parseMode ? { parse_mode: parseMode } : {}),
              ...(replyMarkup ? { reply_markup: replyMarkup } : {})
            }
          );
          return String(sent.message_id);
        }

        if (imageUrl) {
          try {
            const sent = await this.bot.api.sendPhoto(
              Number(
                action.channelExternalId
              ),
              imageUrl,
              {
                caption: content,
                ...(parseMode
                  ? {
                      parse_mode:
                        parseMode
                    }
                  : {}),
                ...(replyMarkup
                  ? {
                      reply_markup:
                        replyMarkup
                    }
                  : {})
              }
            );

            return String(sent.message_id);
          } catch (error) {
            // Telegram must be able to fetch the URL itself. Bot API
            // file URLs (and private/local URLs) are not always
            // reachable from Telegram's servers. Never let an avatar
            // or optional image make the whole command fail.
            this.logger?.error(
              "telegram.message.image_fallback",
              {
                platform: "telegram",
                channelExternalId: action.channelExternalId
              },
              error
            );
          }
        }

        const sent = await this.bot.api.sendMessage(
          Number(
            action.channelExternalId
          ),
          content,
          {
            ...(parseMode
              ? {
                  parse_mode:
                    parseMode
                }
              : {}),
            ...(replyMarkup
              ? {
                  reply_markup:
                    replyMarkup
                }
              : {})
          }
        );

        return String(sent.message_id);

        return;
      }

      case "message.edit": {
        const replyMarkup =
          this.getReplyMarkup(
            action.metadata
          );

        const parseMode =
          this.getParseMode(
            action.metadata
          );

        const rawContent =
          this.getPanelContent(
            action.content,
            action.metadata
          );
        const content = parseMode ? normalizeTelegramMarkdown(rawContent) : rawContent;

        try {
          const imageUrl = this.getImageUrl(action.metadata);
          if (imageUrl) {
            await this.bot.api.editMessageCaption(
              Number(action.channelExternalId),
              Number(action.messageExternalId),
              {
                caption: content,
                ...(parseMode ? { parse_mode: parseMode } : {}),
                ...(replyMarkup ? { reply_markup: replyMarkup } : {})
              }
            );
          } else {
            await this.bot.api.editMessageText(
              Number(action.channelExternalId),
              Number(action.messageExternalId),
              content,
              {
                ...(parseMode ? { parse_mode: parseMode } : {}),
                ...(replyMarkup ? { reply_markup: replyMarkup } : {})
              }
            );
          }
        } catch (error) {
          if (
            isMessageNotModified(error)
          ) {
            return;
          }

          throw error;
        }

        return;
      }

      case "channel.clear": {
        const ids = this.recentMessageIds.get(action.channelExternalId) ?? [];
        const targets = ids.slice(-action.count);
        for (const messageId of targets) {
          try {
            await this.bot.api.deleteMessage(Number(action.channelExternalId), messageId);
          } catch {
            // Messages may be too old or already deleted.
          }
        }
        this.recentMessageIds.set(action.channelExternalId, ids.filter((id) => !targets.includes(id)));
        return;
      }

      case "message.delete":
        await this.bot.api.deleteMessage(
          Number(
            action.channelExternalId
          ),
          Number(
            action.messageExternalId
          )
        );

        return;

      case "member.warn": {
        const targetDisplayName =
          this.getModerationTargetName(
            action.metadata
          );

        const reason =
          action.reason
            ? `\\nПричина: ${action.reason}`
            : "";

        await this.bot.api.sendMessage(
          Number(action.communityExternalId),
          `⚠️ Пользователь ${targetDisplayName} получил предупреждение.${reason}`
        );

        return;
      }

      case "member.mute": {
        if (
          action.durationSeconds === undefined ||
          action.durationSeconds <= 0
        ) {
          throw new Error(
            "Telegram mute requires a positive duration"
          );
        }

        const untilDate =
          Math.floor(Date.now() / 1000) +
          Math.floor(action.durationSeconds);

        await this.bot.api.raw.restrictChatMember({
          chat_id:
            Number(action.communityExternalId),
          user_id:
            Number(action.userExternalId),
          permissions: {
            can_send_messages: false
          },
          until_date: untilDate
        });

        return;
      }

      case "member.kick": {
        const chatId =
          Number(action.communityExternalId);

        const userId =
          Number(action.userExternalId);

        await this.bot.api.banChatMember(
          chatId,
          userId
        );

        await this.bot.api.raw.unbanChatMember({
          chat_id: chatId,
          user_id: userId,
          only_if_banned: true
        });

        return;
      }

      case "member.unmute": {
        const chatId = Number(action.communityExternalId);
        const userId = Number(action.userExternalId);
        await this.bot.api.raw.restrictChatMember({
          chat_id: chatId,
          user_id: userId,
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false,
            can_manage_topics: false
          }
        });
        return;
      }

      case "member.unban":
        await this.bot.api.raw.unbanChatMember({
          chat_id: Number(action.communityExternalId),
          user_id: Number(action.userExternalId),
          only_if_banned: true
        });
        return;

      case "member.ban":
        await this.bot.api.banChatMember(
          Number(
            action.communityExternalId
          ),
          Number(
            action.userExternalId
          )
        );

        return;
    }
  }

  async getMember(
    communityExternalId: string,
    userExternalId: string
  ): Promise<PlatformMemberDetails | undefined> {
    try {
      const member =
        await this.bot.api.getChatMember(
          Number(communityExternalId),
          Number(userExternalId)
        );

      const user = member.user;

      return {
        user: {
          platform: "telegram",
          externalId: String(user.id),
          username: user.username,
          displayName: user.first_name,
          avatarUrl:
            await this.resolveAvatarUrl(
              user.id
            ),
          platformRole:
            member.status === "creator" ||
            member.status === "administrator"
              ? "admin"
              : "member"
        },
        roles:
          member.status === "creator" ||
          member.status === "administrator"
            ? [member.status]
            : [],
        status: member.status
      };
    } catch {
      return undefined;
    }
  }

  async listMembers(
    communityExternalId: string
  ): Promise<PlatformMemberDetails[]> {
    // Telegram does not expose a general "list all members"
    // Bot API method. Keep /members backed by Modexa's
    // persisted membership set and use getMember() for
    // native status details.
    void communityExternalId;
    return [];
  }

  async findMemberByUsername(
    communityExternalId: string,
    username: string
  ): Promise<PlatformMemberDetails | undefined> {
    const normalized = username.replace(/^@/, "").trim().toLowerCase();

    // Native lookup path #3: Telegram can enumerate administrators.
    // This is useful even when the administrator has never written to
    // the bot. For ordinary members Telegram Bot API does not expose a
    // username -> user_id lookup.
    try {
      const administrators =
        await this.bot.api.getChatAdministrators(
          Number(communityExternalId)
        );

      const administrator =
        administrators.find(
          (item) =>
            item.user.username?.toLowerCase() === normalized
        );

      if (administrator) {
        const user = administrator.user;
        const status = administrator.status;

        return {
          user: {
            platform: "telegram",
            externalId: String(user.id),
            username: user.username,
            displayName: user.first_name,
            avatarUrl: await this.resolveAvatarUrl(user.id),
            platformRole:
              status === "creator" || status === "administrator"
                ? "admin"
                : "member"
          },
          roles:
            status === "creator" || status === "administrator"
              ? [status]
              : [],
          status
        };
      }

      this.logger?.warn(
        "telegram.member.lookup.administrators.not_found",
        {
          platform: "telegram",
          adapterId: this.id,
          communityId: communityExternalId,
          username: normalized
        }
      );
    } catch (error) {
      this.logger?.error(
        "telegram.member.lookup.administrators.failed",
        {
          platform: "telegram",
          adapterId: this.id,
          communityId: communityExternalId,
          username: normalized
        },
        error
      );
    }

    return undefined;
  }

  async resolveUser(
    externalId: string
  ): Promise<
    PlatformUser | undefined
  > {
    return {
      platform:
        "telegram",

      externalId
    };
  }

  async resolveCommunity(
    externalId: string
  ): Promise<
    PlatformCommunity | undefined
  > {
    try {
      const chat =
        await this.bot.api.getChat(
          Number(externalId)
        );

      if (
        chat.type === "private"
      ) {
        return undefined;
      }

      return {
        platform:
          "telegram",

        externalId,

        name:
          "title" in chat
            ? chat.title
            : "Telegram"
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
    return {
      platform:
        "telegram",

      externalId,

      name:
        `Telegram channel ${externalId}`
    };
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

  private getModerationTargetName(
    metadata:
      | Record<string, unknown>
      | undefined
  ): string {
    const value =
      metadata?.targetDisplayName;

    return typeof value === "string" &&
      value.trim()
      ? value
      : "пользователь";
  }

  private getPanelContent(
    content: string,
    metadata: Record<string, unknown> | undefined
  ): string {
    const telegram = metadata?.telegram;
    if (!telegram || typeof telegram !== "object") return content;
    const embedValue = "embed" in telegram ? telegram.embed : undefined;
    if (!embedValue || typeof embedValue !== "object") return content;

    const embed = embedValue as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof embed.title === "string") parts.push("*" + embed.title.replace(/([_*[\]()~\`>#+\-=|{}.!])/g, "\\$1") + "*");
    if (typeof embed.description === "string") parts.push(embed.description);
    if (Array.isArray(embed.fields)) {
      for (const field of embed.fields) {
        if (!field || typeof field !== "object") continue;
        const item = field as Record<string, unknown>;
        if (typeof item.name === "string" && typeof item.value === "string") {
          parts.push("*" + item.name + "*: " + item.value);
        }
      }
    }
    return parts.length ? parts.join("\n") : content;
  }

  private getParseMode(
    metadata:
      | Record<string, unknown>
      | undefined
  ): "Markdown" | undefined {
    const telegram =
      metadata?.telegram;

    if (
      !telegram ||
      typeof telegram !== "object" ||
      !("parseMode" in telegram) ||
      telegram.parseMode !== "Markdown"
    ) {
      return undefined;
    }

    return "Markdown";
  }

  private getImageUrl(
    metadata:
      | Record<string, unknown>
      | undefined
  ): string | undefined {
    const telegram =
      metadata?.telegram;

    if (
      !telegram ||
      typeof telegram !== "object" ||
      !("imageUrl" in telegram) ||
      typeof telegram.imageUrl !== "string"
    ) {
      return undefined;
    }

    return telegram.imageUrl;
  }

  private getReplyMarkup(
    metadata:
      | Record<string, unknown>
      | undefined
  ): InlineKeyboard | undefined {
    const telegram =
      metadata?.telegram;

    if (
      !telegram ||
      typeof telegram !== "object" ||
      !("replyMarkup" in telegram)
    ) {
      return undefined;
    }

    const replyMarkup =
      telegram.replyMarkup;

    if (
      replyMarkup instanceof InlineKeyboard
    ) {
      return replyMarkup;
    }

    return undefined;
  }

  private async resolvePlatformRole(
    ctx: Context,
    userId: number
  ): Promise<PlatformUserRole> {
    const chat =
      ctx.chat;

    if (
      !chat ||
      chat.type === "private"
    ) {
      return "member";
    }

    try {
      const member =
        await this.bot.api.getChatMember(
          chat.id,
          userId
        );

      switch (member.status) {
        case "creator":
        case "administrator":
          return "admin";

        default:
          return "member";
      }
    } catch {
      // If Telegram does not allow us to inspect the
      // membership, keep the least privileged role.
      return "member";
    }
  }

  private async resolveAvatarUrl(
    userId: number
  ): Promise<string | undefined> {
    try {
      const photos =
        await this.bot.api.getUserProfilePhotos(
          userId,
          { limit: 1 }
        );

      const photo =
        photos.photos[0]?.at(-1);

      if (!photo) {
        return undefined;
      }

      const file =
        await this.bot.api.getFile(
          photo.file_id
        );

      return file.file_path
        ? `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async createMessageEvent(
    ctx: Context
  ): Promise<AdapterMessageCreatedEvent> {
    const message =
      ctx.message;

    if (!message) {
      throw new Error(
        "Telegram message event does not contain a message"
      );
    }

    const chat =
      ctx.chat;

    if (chat) {
      const key = String(chat.id);
      const ids = this.recentMessageIds.get(key) ?? [];
      ids.push(message.message_id);
      if (ids.length > 200) ids.splice(0, ids.length - 200);
      this.recentMessageIds.set(key, ids);
    }

    if (!chat) {
      throw new Error(
        "Telegram message event does not contain a chat"
      );
    }

    const author =
      message.from;

    const platformRole =
      await this.resolvePlatformRole(
        ctx,
        author.id
      );

    const avatarUrl =
      await this.resolveAvatarUrl(
        author.id
      );

    let bridgeMedia:
      | {
          type: "image" | "animation" | "video";
          url: string;
        }
      | undefined;

    try {
      if ("animation" in message && message.animation) {
        const file = await this.bot.api.getFile(
          message.animation.file_id
        );
        if (file.file_path) {
          bridgeMedia = {
            type: "animation",
            url: `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`
          };
        }
      } else if ("video" in message && message.video) {
        const file = await this.bot.api.getFile(
          message.video.file_id
        );
        if (file.file_path) {
          bridgeMedia = {
            type: "video",
            url: `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`
          };
        }
      } else if ("photo" in message && message.photo?.length) {
        const photo = message.photo.at(-1);
        if (photo) {
          const file = await this.bot.api.getFile(
            photo.file_id
          );
          if (file.file_path) {
            bridgeMedia = {
              type: "image",
              url: `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`
            };
          }
        }
      }
    } catch {
      // Media is optional for bridge relay.
    }

    return {
      type:
        "message.created",

      message: {
        externalId:
          String(
            message.message_id
          ),

        platform:
          "telegram",

        author: {
          platform:
            "telegram",

          externalId:
            String(author.id),

          username:
            author.username,

          displayName:
            author.first_name,

          avatarUrl,

          platformRole
        },

        destinationExternalId:
          String(chat.id),

        community:
          this.createCommunity(
            ctx
          ),

        channel:
          this.createChannel(
            ctx
          ),

        replyTo:
          "reply_to_message" in message &&
          message.reply_to_message?.from
            ? {
                platform: "telegram",
                externalId:
                  String(
                    message.reply_to_message.from.id
                  ),
                username:
                  message.reply_to_message.from.username,
                displayName:
                  message.reply_to_message.from.first_name
              }
            : undefined,

        content:
          "text" in message &&
          typeof message.text === "string"
            ? message.text
            : "",

        createdAt:
          new Date(
            message.date * 1000
          ),

        metadata:
          bridgeMedia
            ? { bridgeMedia }
            : undefined
      }
    };
  }

  private async createInteractionEvent(
    ctx: Context
  ): Promise<AdapterEvent> {
    const callbackQuery =
      ctx.callbackQuery;

    if (!callbackQuery) {
      throw new Error(
        "Telegram interaction event does not contain a callback query"
      );
    }

    const user =
      ctx.from;

    if (!user) {
      throw new Error(
        "Telegram interaction event does not contain a user"
      );
    }

    const callbackData =
      callbackQuery.data;

    const message =
      callbackQuery.message;

    const chat =
      message?.chat;

    const isGroup =
      chat !== undefined &&
      chat.type !== "private";

    const externalChat =
      chat && isGroup
        ? {
            platform:
              "telegram" as const,

            externalId:
              String(chat.id),

            name:
              "title" in chat
                ? chat.title
                : "Telegram"
          }
        : undefined;

    const platformRole =
      await this.resolvePlatformRole(
        ctx,
        user.id
      );

    const avatarUrl =
      await this.resolveAvatarUrl(
        user.id
      );

    return {
      type:
        "interaction.created",

      interaction: {
        externalId:
          String(
            callbackQuery.id
          ),

        platform:
          "telegram",

        user: {
          platform:
            "telegram",

          externalId:
            String(user.id),

          username:
            user.username,

          displayName:
            user.first_name,

          avatarUrl,

          platformRole
        },

        community:
          externalChat,

        channel:
          externalChat,

        destinationExternalId:
          chat
            ? String(chat.id)
            : undefined,

        messageExternalId:
          message
            ? String(
                message.message_id
              )
            : undefined,

        token:
          parseTelegramCallbackData(
            callbackData
          ),

        createdAt:
          new Date(),

        metadata: {
          callbackData
        }
      }
    };
  }

  private createCommunity(
    ctx: Context
  ): PlatformCommunity | undefined {
    const chat =
      ctx.chat;

    if (!chat) {
      return undefined;
    }

    if (
      chat.type === "private"
    ) {
      return undefined;
    }

    return {
      platform:
        "telegram",

      externalId:
        String(chat.id),

      name:
        "title" in chat
          ? chat.title
          : "Telegram"
    };
  }

  private createChannel(
    ctx: Context
  ): PlatformChannel | undefined {
    const chat =
      ctx.chat;

    if (!chat) {
      return undefined;
    }

    if (
      chat.type === "private"
    ) {
      return undefined;
    }

    return {
      platform:
        "telegram",

      externalId:
        String(chat.id),

      name:
        "title" in chat
          ? chat.title
          : "Telegram"
    };
  }

  private registerHandlers(): void {
    this.bot.on(
      "message",
      async (ctx) => {
        const event =
          await this.createMessageEvent(
            ctx
          );

        await this.emitEvent(
          event
        );
      }
    );

    this.bot.on(
      "chat_member",
      async (ctx) => {
        const update = ctx.chatMember;
        if (!update || !ctx.chat) return;

        const member = update.new_chat_member;
        const user = member.user;
        if (!user || ctx.chat.type === "private") return;

        const active =
          member.status === "member" ||
          member.status === "administrator" ||
          member.status === "creator" ||
          member.status === "restricted";

        const platformRole =
          member.status === "creator" ||
          member.status === "administrator"
            ? "admin" as const
            : "member" as const;

        const eventType =
          member.status === "kicked"
            ? "member.banned" as const
            : active
              ? "member.joined" as const
              : "member.left" as const;

        await this.emitEvent({
          type: eventType,
          member: {
            externalId: String(user.id),
            platform: "telegram",
            user: {
              platform: "telegram",
              externalId: String(user.id),
              username: user.username,
              displayName: user.first_name,
              avatarUrl: await this.resolveAvatarUrl(user.id),
              platformRole
            },
            community: {
              platform: "telegram",
              externalId: String(ctx.chat.id),
              name:
                "title" in ctx.chat
                  ? ctx.chat.title
                  : "Telegram"
            },
            createdAt: new Date(update.date * 1000),
            metadata: {
              status: member.status
            }
          }
        });
      }
    );

    this.bot.on(
      "edited_message",
      async (ctx) => {
        if (!ctx.message) return;

        const event = await this.createMessageEvent(ctx);

        await this.emitEvent({
          type: "message.updated",
          message: event.message
        });
      }
    );

    this.bot.on(
      "callback_query:data",
      async (ctx) => {
        const interactionId =
          ctx.callbackQuery.id;

        try {
          await this.emitEvent(
            await this.createInteractionEvent(
              ctx
            )
          );
        } finally {
          const text =
            this.pendingAnswers.get(
              interactionId
            );

          this.pendingAnswers.delete(
            interactionId
          );

          try {
            await ctx.answerCallbackQuery(
              text
            );
          } catch {
            // The callback query may already
            // have expired on Telegram's side.
          }
        }
      }
    );
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