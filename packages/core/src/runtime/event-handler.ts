import type {
  AdapterAction
} from "../adapters/actions.js";

import type {
  AdapterCommandInvocation,
  AdapterEvent,
  AdapterInteraction,
  AdapterMessage
} from "../adapters/events.js";

import type {
  PlatformChannel,
  PlatformCommunity,
  PlatformUser
} from "../adapters/types.js";

import type {
  ExecutionContextService
} from "../contexts/service.js";

import type {
  ExecutionContext
} from "../contexts/types.js";

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

import type {
  PlatformIdentityResolver
} from "./identity.js";

import type {
  BridgeService
} from "../bridge/service.js";

const EMPTY_CONTENT_FALLBACK =
  "…";

export interface PlatformResponder {
  readonly id: string;

  sendAction(
    action: AdapterAction
  ): Promise<void>;

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

  executionContextService:
    ExecutionContextService;

  identityResolver?:
    PlatformIdentityResolver;

  bridgeService?:
    BridgeService;

  renderMetadata(
    response: BoundInteractionResponse
  ):
    | Record<string, unknown>
    | undefined;
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

        case "command.invoked":
          await handleCommandInvocation(
            deps,
            event.invocation
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
          platform:
            deps.platform,
          adapterId:
            deps.responder.id,
          eventType:
            event.type
        },
        error
      );
    }
  };
}

interface BuildContextInput {
  correlationId: string;

  author: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;
}

function buildExecutionContext(
  deps: PlatformEventHandlerDeps,
  input: BuildContextInput
): ExecutionContext {
  const resolved =
    deps.identityResolver?.resolve({
      platform:
        deps.platform,
      correlationId:
        input.correlationId,
      author:
        input.author,
      community:
        input.community,
      channel:
        input.channel
    });

  if (
    deps.bridgeService &&
    input.community &&
    input.channel
  ) {
    deps.bridgeService.registerEndpoint({
      platform:
        deps.platform,
      communityExternalId:
        input.community.externalId,
      communityName:
        input.community.name,
      channelExternalId:
        input.channel.externalId,
      channelName:
        input.channel.name,
      communityId:
        resolved?.community?.id,
      channelId:
        resolved?.channel?.id
    });
  }

  return createPlatformExecutionContext(
    deps.executionContextService,
    {
      platform:
        deps.platform,
      correlationId:
        input.correlationId,
      author:
        input.author,
      community:
        input.community,
      channel:
        input.channel,
      resolved
    }
  );
}

async function handleMessage(
  deps: PlatformEventHandlerDeps,
  message: AdapterMessage
): Promise<void> {
  const correlationId =
    `${deps.platform}-${message.externalId}`;

  deps.logger.debug(
    "adapter.event.received",
    {
      correlationId,
      platform:
        deps.platform,
      adapterId:
        deps.responder.id,
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

  const executionContext =
    buildExecutionContext(
      deps,
      {
        correlationId,
        author:
          message.author,
        community:
          message.community,
        channel:
          message.channel
      }
    );

  if (
    deps.bridgeService &&
    message.content &&
    !message.content.startsWith("/")
  ) {
    const source =
      deps.bridgeService.findEndpointForExecution(
        executionContext
      );

    if (source) {
      await deps.bridgeService.relayMessage(
        source,
        message.author,
        message.content,
        message.replyTo
      );
    }
  }

  if (
    !message.content.startsWith("/")
  ) {
    return;
  }

  await runCommand(
    deps,
    {
      correlationId,
      rawText:
        message.content,
      destinationExternalId:
        message.destinationExternalId,
      replyToExternalId:
        undefined
    },
    executionContext
  );
}

async function handleCommandInvocation(
  deps: PlatformEventHandlerDeps,
  invocation: AdapterCommandInvocation
): Promise<void> {
  const correlationId =
    `${deps.platform}-command-${invocation.externalId}`;

  deps.logger.debug(
    "adapter.event.received",
    {
      correlationId,
      platform:
        deps.platform,
      adapterId:
        deps.responder.id,
      externalCommandId:
        invocation.externalId,
      command:
        invocation.name,
      userExternalId:
        invocation.user.externalId,
      communityExternalId:
        invocation.community?.externalId,
      channelExternalId:
        invocation.channel?.externalId,
      destinationExternalId:
        invocation.destinationExternalId
    }
  );

  const executionContext =
    buildExecutionContext(
      deps,
      {
        correlationId,
        author:
          invocation.user,
        community:
          invocation.community,
        channel:
          invocation.channel
      }
    );

  await runCommand(
    deps,
    {
      correlationId,
      rawText:
        `/${[
          invocation.name,
          ...invocation.args
        ].join(" ")}`,
      destinationExternalId:
        invocation.destinationExternalId,
      replyToExternalId:
        invocation.externalId
    },
    executionContext
  );
}

interface RunCommandInput {
  correlationId: string;

  rawText: string;

  destinationExternalId: string;

  replyToExternalId?: string;
}

async function runCommand(
  deps: PlatformEventHandlerDeps,
  input: RunCommandInput,
  executionContext: ExecutionContext
): Promise<void> {
  const {
    platform,
    responder,
    logger,
    commandService,
    store
  } = deps;

  const {
    correlationId
  } = input;

  logger.debug(
    "execution.context.created",
    {
      correlationId,
      platform:
        executionContext.platform,
      contextType:
        executionContext.type,
      userId:
        executionContext.user.id,
      communityId:
        executionContext.community?.id,
      channelId:
        executionContext.channel?.id,
      locale:
        executionContext.locale
    }
  );

  const result =
    await commandService.handle(
      input.rawText,
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

  const bound =
    store.bindResponse(
      result.response,
      {
        userId:
          executionContext.user.id,
        platform
      }
    );

  const metadata =
    deps.renderMetadata(
      bound
    );

  await responder.sendAction({
    type:
      "message.send",
    platform,
    channelExternalId:
      input.destinationExternalId,
    content:
      bound.content ??
      EMPTY_CONTENT_FALLBACK,
    replyToExternalId:
      input.replyToExternalId,
    metadata
  });

  logger.info(
    "command.response.sent",
    {
      correlationId,
      platform,
      adapterId:
        responder.id,
      command:
        input.rawText
          .trim()
          .split(/\s+/)[0],
      contextType:
        executionContext.type,
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
    dispatcher
  } = deps;

  const correlationId =
    `${platform}-interaction-${interaction.externalId}`;

  if (!interaction.token) {
    logger.debug(
      "interaction.ignored",
      {
        correlationId,
        platform,
        adapterId:
          responder.id,
        reason:
          "no_token"
      }
    );

    return;
  }

  const executionContext =
    buildExecutionContext(
      deps,
      {
        correlationId,
        author:
          interaction.user,
        community:
          interaction.community,
        channel:
          interaction.channel
      }
    );

  const result =
    await dispatcher.dispatch({
      token:
        interaction.token,
      execution:
        executionContext
    });

  if (
    result.status !==
    "handled"
  ) {
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
        adapterId:
          responder.id
      }
    );

    return;
  }

  if (
    result.response.close &&
    interaction.messageExternalId
  ) {
    await responder.sendAction({
      type: "message.delete",
      platform,
      channelExternalId:
        destination,
      messageExternalId:
        interaction.messageExternalId
    });

    logger.info(
      "interaction.response.closed",
      {
        correlationId,
        platform,
        adapterId:
          responder.id,
        contextType:
          executionContext.type
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

  if (
    interaction.messageExternalId
  ) {
    await responder.sendAction({
      type:
        "message.edit",
      platform,
      channelExternalId:
        destination,
      messageExternalId:
        interaction.messageExternalId,
      content,
      metadata
    });
  } else {
    await responder.sendAction({
      type:
        "message.send",
      platform,
      channelExternalId:
        destination,
      content,
      metadata
    });
  }

  logger.info(
    "interaction.response.sent",
    {
      correlationId,
      platform,
      adapterId:
        responder.id,
      contextType:
        executionContext.type,
      mode:
        interaction.messageExternalId
          ? "edit"
          : "send",
      hasInteraction:
        metadata !== undefined
    }
  );
}