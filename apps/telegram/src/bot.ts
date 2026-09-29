import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  createBuiltinCommands,
  ExecutionContextService
} from "@modexa/core";

import {
  Bot
} from "grammy";

import {
  TelegramAdapter
} from "./adapter.js";

import {
  renderTelegramInteraction
} from "./interactions.js";

export function createTelegramAdapter(
  token: string,
  logger: CoreLogger
): TelegramAdapter {
  const bot =
    new Bot(token);

  const parser =
    new CommandParser();

  const registry =
    new CommandRegistry();

  createBuiltinCommands(
    registry
  );

  const commandService =
    new CommandService(
      parser,
      registry,
      logger
    );

  const executionContextService =
    new ExecutionContextService();

  const adapter =
    new TelegramAdapter(
      bot
    );

  adapter.onEvent(
    async (event) => {
      if (
        event.type !==
        "message.created"
      ) {
        return;
      }

      const message =
        event.message;

      const correlationId =
        `telegram-${message.externalId}`;

      logger.debug(
        "adapter.event.received",
        {
          correlationId,
          platform:
            "telegram",
          adapterId:
            adapter.id,
          externalMessageId:
            message.externalId,
          userExternalId:
            message.author.externalId,
          communityExternalId:
            message.community
              ?.externalId,
          channelExternalId:
            message.channel
              ?.externalId,
          destinationExternalId:
            message.destinationExternalId
        }
      );

      if (
        !message.content.startsWith("/")
      ) {
        return;
      }

      const user = {
        id:
          `telegram:${message.author.externalId}`,

        displayName:
          message.author.displayName ??
          message.author.username ??
          message.author.externalId,

        createdAt:
          new Date(),

        updatedAt:
          new Date()
      };

      const community =
        message.community
          ? {
              id:
                `telegram:${message.community.externalId}`,

              name:
                message.community.name,

              createdAt:
                new Date(),

              updatedAt:
                new Date()
            }
          : undefined;

      const channel =
        message.channel
          ? {
              id:
                `telegram:${message.channel.externalId}`,

              communityId:
                community?.id ??
                `telegram:${message.channel.externalId}`,

              name:
                message.channel.name,

              type:
                "telegram_chat" as const,

              createdAt:
                new Date(),

              updatedAt:
                new Date()
            }
          : undefined;

      const executionContext =
        executionContextService.create({
          platform:
            "telegram",

          correlationId,

          user,

          community,

          channel
        });

      logger.debug(
        "execution.context.created",
        {
          correlationId:
            executionContext.correlationId,

          platform:
            executionContext.platform,

          contextType:
            executionContext.type,

          userId:
            executionContext.user.id,

          communityId:
            executionContext.community?.id,

          channelId:
            executionContext.channel?.id
        }
      );

      const result =
        await commandService.handle(
          message.content,
          {
            platform:
              executionContext.platform,

            user:
              executionContext.user,

            community:
              executionContext.community,

            channel:
              executionContext.channel,

            execution:
              executionContext
          },
          executionContext
        );

      if (
        !result.handled ||
        !result.response
      ) {
        return;
      }

      const replyMarkup =
        renderTelegramInteraction(
          result.response
        );

      logger.debug(
        "adapter.action.created",
        {
          correlationId,

          platform:
            "telegram",

          adapterId:
            adapter.id,

          action:
            "message.send",

          destinationExternalId:
            message.destinationExternalId,

          hasInteraction:
            replyMarkup !== undefined
        }
      );

      await adapter.sendAction({
        type:
          "message.send",

        platform:
          "telegram",

        channelExternalId:
          message.destinationExternalId,

        content:
          result.response.content,

        metadata:
          replyMarkup
            ? {
                telegram: {
                  replyMarkup
                }
              }
            : undefined
      });

      logger.info(
        "command.response.sent",
        {
          correlationId,

          platform:
            "telegram",

          adapterId:
            adapter.id,

          command:
            message.content
              .trim()
              .split(/\s+/)[0],

          contextType:
            executionContext.type,

          hasInteraction:
            replyMarkup !== undefined
        }
      );
    }
  );

  return adapter;
}