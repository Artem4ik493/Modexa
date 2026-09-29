import {
  type AdapterAction,
  type AdapterEvent,
  type PlatformAdapter,
  type PlatformChannel,
  type PlatformCommunity,
  type PlatformUser
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
  implements PlatformAdapter
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

  constructor(
    private readonly bot: Bot
  ) {
    this.registerHandlers();
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    await this.bot.start();
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
  ): Promise<void> {
    switch (action.type) {
      case "message.send": {
        const replyMarkup =
          this.getReplyMarkup(
            action.metadata
          );

        await this.bot.api.sendMessage(
          Number(
            action.channelExternalId
          ),
          action.content,
          replyMarkup
            ? {
                reply_markup:
                  replyMarkup
              }
            : undefined
        );

        return;
      }

      case "message.edit": {
        const replyMarkup =
          this.getReplyMarkup(
            action.metadata
          );

        try {
          await this.bot.api.editMessageText(
            Number(
              action.channelExternalId
            ),
            Number(
              action.messageExternalId
            ),
            action.content,
            replyMarkup
              ? {
                  reply_markup:
                    replyMarkup
                }
              : undefined
          );
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

      case "member.warn":
        throw new Error(
          "Telegram member.warn action is not implemented yet"
        );

      case "member.mute":
        throw new Error(
          "Telegram member.mute action is not implemented yet"
        );

      case "member.kick":
        throw new Error(
          "Telegram member.kick action is not implemented yet"
        );

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

  private registerHandlers(): void {
    this.bot.on(
      "message",
      async (ctx) => {
        const event =
          this.createMessageEvent(
            ctx
          );

        await this.emitEvent(
          event
        );
      }
    );

    this.bot.on(
      "callback_query:data",
      async (ctx) => {
        const interactionId =
          ctx.callbackQuery.id;

        try {
          await this.emitEvent(
            this.createInteractionEvent(
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

  private createMessageEvent(
    ctx: Context
  ): AdapterEvent {
    const message =
      ctx.message;

    if (!message) {
      throw new Error(
        "Telegram message event does not contain a message"
      );
    }

    const chat =
      ctx.chat;

    if (!chat) {
      throw new Error(
        "Telegram message event does not contain a chat"
      );
    }

    const author =
      message.from;

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
            author.first_name
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

        content:
          "text" in message &&
          typeof message.text === "string"
            ? message.text
            : "",

        createdAt:
          new Date(
            message.date * 1000
          )
      }
    };
  }

  private createInteractionEvent(
    ctx: Context
  ): AdapterEvent {
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
            user.first_name
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