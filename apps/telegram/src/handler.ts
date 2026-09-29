import type {
  AdapterAction,
  AdapterEvent,
  AdapterInteraction,
  AdapterMessage,
  CommandService,
  ExecutionContextService,
  InteractionActionStore,
  InteractionDispatcher,
  Logger
} from "@modexa/core";

import {
  createTelegramExecutionContext
} from "./context.js";

import {
  renderTelegramInteraction
} from "./interactions.js";

/**
 * Telegram telegram can not edit a message to empty text.
 */
const EMPTY_CONTENT_FALLBACK = "…";

export interface TelegramResponder {
  readonly id: string;

  sendAction(
    action: AdapterAction
  ): Promise<void>;

  answerInteraction(
    interactionExternalId: string,
    text: string
  ): void;
}

export interface TelegramEventHandlerDeps {
  responder: TelegramResponder;

  logger: Logger;

  commandService: CommandService;

  dispatcher: InteractionDispatcher;

  store: InteractionActionStore;

  executionContextService: ExecutionContextService;
}

export function createTelegramEventHandler(
  deps: TelegramEventHandlerDeps
): (
  event: AdapterEvent
) => Promise<void> {
  return async (event) => {
    try {
      switch (event.type) {
        case "message.created":
          await handleMessage(
            deps,
            event.message
          );
          return;

        case "interaction.created":
          await handleInteraction(
            deps,
            event.interaction
          );
          return;

        default:
          return;
      }
    } catch (error) {
      deps.logger.error(
        "telegram.event.failed",
        {
          platform: "telegram",
          adapterId: deps.responder.id,
          eventType: event.type
        },
        error
      );
    }
  };
}

async function handleMessage(
  deps: TelegramEventHandlerDeps,
  message: AdapterMessage
): Promise<void> {
  const {
    responder,
    logger,
    commandService,
    store,
    executionContextService
  } = deps;

  const correlationId =
    `telegram-${message.externalId}`;

  logger.debug(
    "adapter.event.received",
    {
      correlationId,
      platform: "telegram",
      adapterId: responder.id,
      externalMessageId:
        message.externalId,
      userExternalId:
        message.author.externalId,
      communityExternalId:
        message.community?.externalId,
      channelExternalId:
        message.channel?.externalId,
      destinationExternalId:
        message.destinationExternalId
    }
  );

  if (!message.content.startsWith("/")) {
    return;
  }

  const executionContext =
    createTelegramExecutionContext(
      executionContextService,
      {
        correlationId,
        author: message.author,
        community: message.community,
        channel: message.channel
      }
    );

  logger.debug(
    "execution.context.created",
    {
      correlationId,
      platform: executionContext.platform,
      contextType: executionContext.type,
      userId: executionContext.user.id,
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
        user: executionContext.user,
        community:
          executionContext.community,
        channel: executionContext.channel,
        execution: executionContext
      },
      executionContext
    );

  if (
    !result.handled ||
    !result.response
  ) {
    return;
  }

  const bound = store.bindResponse(
    result.response,
    {
      userId: executionContext.user.id,
      platform: "telegram"
    }
  );

  const replyMarkup =
    renderTelegramInteraction(bound);

  await responder.sendAction({
    type: "message.send",
    platform: "telegram",
    channelExternalId:
      message.destinationExternalId,
    content:
      bound.content ??
      EMPTY_CONTENT_FALLBACK,
    metadata: replyMarkup
      ? { telegram: { replyMarkup } }
      : undefined
  });

  logger.info(
    "command.response.sent",
    {
      correlationId,
      platform: "telegram",
      adapterId: responder.id,
      command: message.content
        .trim()
        .split(/\s+/)[0],
      contextType: executionContext.type,
      hasInteraction:
        replyMarkup !== undefined
    }
  );
}

async function handleInteraction(
  deps: TelegramEventHandlerDeps,
  interaction: AdapterInteraction
): Promise<void> {
  const {
    responder,
    logger,
    dispatcher,
    executionContextService
  } = deps;

  const correlationId =
    `telegram-interaction-${interaction.externalId}`;

  if (!interaction.token) {
    logger.debug(
      "interaction.ignored",
      {
        correlationId,
        platform: "telegram",
        adapterId: responder.id,
        reason: "no_token"
      }
    );

    return;
  }

  const executionContext =
    createTelegramExecutionContext(
      executionContextService,
      {
        correlationId,
        author: interaction.user,
        community: interaction.community,
        channel: interaction.channel
      }
    );

  const result =
    await dispatcher.dispatch({
      token: interaction.token,
      execution: executionContext
    });

  if (result.status !== "handled") {
    responder.answerInteraction(
      interaction.externalId,
      result.message
    );

    return;
  }

  const destination =
    interaction.destinationExternalId;

  if (!destination) {
    logger.warn(
      "interaction.no_destination",
      {
        correlationId,
        platform: "telegram",
        adapterId: responder.id
      }
    );

    return;
  }

  const replyMarkup =
    renderTelegramInteraction(
      result.response
    );

  const content =
    result.response.content ??
    EMPTY_CONTENT_FALLBACK;

  const metadata = replyMarkup
    ? { telegram: { replyMarkup } }
    : undefined;

  if (interaction.messageExternalId) {
    await responder.sendAction({
      type: "message.edit",
      platform: "telegram",
      channelExternalId: destination,
      messageExternalId:
        interaction.messageExternalId,
      content,
      metadata
    });
  } else {
    await responder.sendAction({
      type: "message.send",
      platform: "telegram",
      channelExternalId: destination,
      content,
      metadata
    });
  }

  logger.info(
    "interaction.response.sent",
    {
      correlationId,
      platform: "telegram",
      adapterId: responder.id,
      contextType: executionContext.type,
      mode: interaction.messageExternalId
        ? "edit"
        : "send",
      hasInteraction:
        replyMarkup !== undefined
    }
  );
}