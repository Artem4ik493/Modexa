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
  translate
} from "../i18n/translate.js";

import {
  createPlatformExecutionContext
} from "./context.js";

import type {
  PlatformIdentityResolver
} from "./identity.js";

import type {
  BridgeService
} from "../bridge/service.js";

import type {
  ModexaDatabase
} from "../database/service.js";

import type {
  AuditService
} from "../audit/service.js";

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

  database?:
    ModexaDatabase;

  auditService?:
    AuditService;

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

        case "message.updated":
          await handleMessageUpdate(
            deps,
            event.message
          );
          return;

        case "message.deleted":
          await handleMessageDelete(
            deps,
            event.message
          );
          return;

        case "member.joined":
        case "member.left":
        case "member.banned":
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
          return;async function handleMessageUpdate(
  deps: PlatformEventHandlerDeps,
  message: AdapterMessage
): Promise<void> {
  const executionContext = buildExecutionContext(
    deps,
    {
      correlationId: `${deps.platform}-update-${message.externalId}`,
      author: message.author,
      community: message.community,
      channel: message.channel
    }
  );

  if (
    deps.bridgeService &&
    message.community &&
    message.channel &&
    !deps.bridgeService.isRelayedMessage(message.content)
  ) {
    const source = deps.bridgeService.findEndpointForExecution(executionContext);
    if (source) {
      await deps.bridgeService.relayMessageUpdate(
        source,
        message.externalId,
        message.author,
        message.content
      );
    }
  }

  deps.auditService?.record({
    communityId: executionContext.community?.id ?? "system",
    action: "message.edit",
    actorUserId: executionContext.user.id,
    channelId: executionContext.channel?.id,
    messageId: message.externalId
  });
}

async function handleMessageDelete(
  deps: PlatformEventHandlerDeps,
  message: AdapterMessage
): Promise<void> {
  const executionContext = buildExecutionContext(
    deps,
    {
      correlationId: `${deps.platform}-delete-${message.externalId}`,
      author: message.author,
      community: message.community,
      channel: message.channel
    }
  );

  if (
    deps.bridgeService &&
    message.community &&
    message.channel &&
    !deps.bridgeService.isRelayedMessage(message.content)
  ) {
    const source = deps.bridgeService.findEndpointForExecution(executionContext);
    if (source) {
      await deps.bridgeService.relayMessageDelete(
        source,
        message.externalId
      );
    }
  }

  deps.auditService?.record({
    communityId: executionContext.community?.id ?? "system",
    action: "message.delete",
    actorUserId: executionContext.user.id,
    channelId: executionContext.channel?.id,
    messageId: message.externalId
  });
}

}