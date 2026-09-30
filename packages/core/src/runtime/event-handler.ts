import type {
  AdapterAction
} from "../adapters/actions.js";

import type {
  AdapterEvent,
  AdapterInteraction,
  AdapterMessage
} from "../adapters/events.js";

import type {
  ExecutionContextService
} from "../contexts/service.js";

import type {
  Logger
} from "../diagnostics/types.js";

import type {
  InteractionActionStore
} from "../interactions/action-store.js";

import type {
  InteractionDispatcher
} from "../interactions/dispatcher.js";

import type {
  BoundInteractionResponse
} from "../interactions/types.js";

import type {
  CommandService
} from "../service.js";

import type {
  Platform
} from "../types.js";

import {
  createPlatformExecutionContext
} from "./context.js";

/**
 * Platforms can not send or edit a message to empty text.
 */
const EMPTY_CONTENT_FALLBACK = "…";

/**
 * What the shared handler needs from an adapter.
 */
export interface PlatformResponder {
  readonly id: string;

  sendAction(
    action: AdapterAction
  ): Promise<void>;

  /**
   * Text shown to the user who pressed a button when
   * the interaction could not be handled.
   */
  answerInteraction(
    interactionExternalId: string,
    text: string
  ): void;
}

export interface PlatformEventHandlerDeps {
  platform: Platform;

  responder: PlatformResponder;

  logger: Logger;

  commandService: CommandService;

  dispatcher: InteractionDispatcher;

  store: InteractionActionStore;

  executionContextService: ExecutionContextService;

  /**
   * Platform-specific rendering of a bound response
   * (Telegram reply markup, Discord components, ...).
   * The result is passed as action metadata.
   * Return undefined when there is nothing to render.
   */
  renderMetadata(
    response: BoundInteractionResponse
  ): Record<string, unknown> | undefined;
}

export function createPlatformEventHandler(
  deps: PlatformEventHandlerDeps
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
        `${deps.platform}.event.failed`,
        {
          platform: deps.platform,
          adapterId: deps.responder.id,
          eventType: event.type
        },
        error
      );
    }
  };
}

async function handleMessage(
  deps: PlatformEventHandlerDeps,
  message: AdapterMessage
): Promise<void> {
  const {
    platform,
    responder,
    logger,
    commandService,
    store,
    executionContextService
  } = deps;

  const correlationId =
    `${platform}-${message.externalId}`;

  logger.debug(
    "adapter.event.received",
    {
      correlationId,
      platform,
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
    createPlatformExecutionContext(
      executionContextService,
      {
        platform,
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
      platform
    }
  );

  const metadata =
    deps.renderMetadata(bound);

  await responder.sendAction({
    type: "message.send",
    platform,
    channelExternalId:
      message.destinationExternalId,
    content:
      bound.content ??
      EMPTY_CONTENT_FALLBACK,
    metadata
  });

  logger.info(
    "command.response.sent",
    {
      correlationId,
      platform,
      adapterId: responder.id,
      command: message.content
        .trim()
        .split(/\s+/)[0],
      contextType: executionContext.type,
      hasInteraction:
        metadata !== undefined
    }
  );
}

async function handleInteraction(
  deps: PlatformEventHandlerDeps,
  interaction: AdapterInteraction
): Promise<void> {
  const {
    platform,
    responder,
    logger,
    dispatcher,
    executionContextService
  } = deps;

  const correlationId =
    `${platform}-interaction-${interaction.externalId}`;

  if (!interaction.token) {
    logger.debug(
      "interaction.ignored",
      {
        correlationId,
        platform,
        adapterId: responder.id,
        reason: "no_token"
      }
    );

    return;
  }

  const executionContext =
    createPlatformExecutionContext(
      executionContextService,
      {
        platform,
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
        platform,
        adapterId: responder.id
      }
    );

    return;
  }

  const metadata =
    deps.renderMetadata(
      result.response
    );

  const content =
    result.response.content ??
    EMPTY_CONTENT_FALLBACK;

  if (interaction.messageExternalId) {
    await responder.sendAction({
      type: "message.edit",
      platform,
      channelExternalId: destination,
      messageExternalId:
        interaction.messageExternalId,
      content,
      metadata
    });
  } else {
    await responder.sendAction({
      type: "message.send",
      platform,
      channelExternalId: destination,
      content,
      metadata
    });
  }

  logger.info(
    "interaction.response.sent",
    {
      correlationId,
      platform,
      adapterId: responder.id,
      contextType: executionContext.type,
      mode: interaction.messageExternalId
        ? "edit"
        : "send",
      hasInteraction:
        metadata !== undefined
    }
  );
}