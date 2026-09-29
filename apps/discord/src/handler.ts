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
  createDiscordExecutionContext
} from "./context.js";

import {
  renderDiscordInteraction
} from "./interactions.js";

/**
 * Discord can not send or edit a message to empty text.
 */
const EMPTY_CONTENT_FALLBACK = "…";

export interface DiscordResponder {
  readonly id: string;

  sendAction(
    action: AdapterAction
  ): Promise<void>;

  answerInteraction(
    interactionExternalId: string,
    text: string
  ): void;
}

export interface DiscordEventHandlerDeps {
  responder: DiscordResponder;

  logger: Logger;

  commandService: CommandService;

  dispatcher: InteractionDispatcher;

  store: InteractionActionStore;

  executionContextService: ExecutionContextService;
}

export function createDiscordEventHandler(
  deps: DiscordEventHandlerDeps
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
        "discord.event.failed",
        {
          platform: "discord",
          adapterId: deps.responder.id,
          eventType: event.type
        },
        error
      );
    }
  };
}

function toMetadata(
  components: unknown
): Record<string, unknown> | undefined {
  return components
    ? { discord: { components } }
    : undefined;
}

async function handleMessage(
  deps: DiscordEventHandlerDeps,
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
    `discord-${message.externalId}`;

  logger.debug(
    "adapter.event.received",
    {
      correlationId,
      platform: "discord",
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
    createDiscordExecutionContext(
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
      platform: "discord"
    }
  );

  const components =
    renderDiscordInteraction(bound);

  await responder.sendAction({
    type: "message.send",
    platform: "discord",
    channelExternalId:
      message.destinationExternalId,
    content:
      bound.content ??
      EMPTY_CONTENT_FALLBACK,
    metadata: toMetadata(components)
  });

  logger.info(
    "command.response.sent",
    {
      correlationId,
      platform: "discord",
      adapterId: responder.id,
      command: message.content
        .trim()
        .split(/\s+/)[0],
      contextType: executionContext.type,
      hasInteraction:
        components !== undefined
    }
  );
}

async function handleInteraction(
  deps: DiscordEventHandlerDeps,
  interaction: AdapterInteraction
): Promise<void> {
  const {
    responder,
    logger,
    dispatcher,
    executionContextService
  } = deps;

  const correlationId =
    `discord-interaction-${interaction.externalId}`;

  if (!interaction.token) {
    logger.debug(
      "interaction.ignored",
      {
        correlationId,
        platform: "discord",
        adapterId: responder.id,
        reason: "no_token"
      }
    );

    return;
  }

  const executionContext =
    createDiscordExecutionContext(
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
        platform: "discord",
        adapterId: responder.id
      }
    );

    return;
  }

  const components =
    renderDiscordInteraction(
      result.response
    );

  const content =
    result.response.content ??
    EMPTY_CONTENT_FALLBACK;

  const metadata =
    toMetadata(components);

  if (interaction.messageExternalId) {
    await responder.sendAction({
      type: "message.edit",
      platform: "discord",
      channelExternalId: destination,
      messageExternalId:
        interaction.messageExternalId,
      content,
      metadata
    });
  } else {
    await responder.sendAction({
      type: "message.send",
      platform: "discord",
      channelExternalId: destination,
      content,
      metadata
    });
  }

  logger.info(
    "interaction.response.sent",
    {
      correlationId,
      platform: "discord",
      adapterId: responder.id,
      contextType: executionContext.type,
      mode: interaction.messageExternalId
        ? "edit"
        : "send",
      hasInteraction:
        components !== undefined
    }
  );
}