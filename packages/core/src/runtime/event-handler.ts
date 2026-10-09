import type {
  AdapterAction
} from "../adapters/actions.js";

import type {
  AdapterCommandInvocation,
  AdapterEvent,
  AdapterMemberEvent,
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

import type {
  IdentityService
} from "../identity/service.js";

import type {
  MembershipService
} from "../memberships/service.js";

import type {
  CommunityService
} from "../communities/service.js";

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

  identityService?:
    IdentityService;

  membershipService?:
    MembershipService;

  communityService?:
    CommunityService;

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

        case "member.joined":
          await handleMemberJoined(
            deps,
            event.member
          );
          return;

        case "member.left":
          await handleMemberLeft(
            deps,
            event.member
          );
          return;

        case "member.banned":
          await handleMemberBanned(
            deps,
            event.member
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

async function handleMemberJoined(
  deps: PlatformEventHandlerDeps,
  member: AdapterMemberEvent
): Promise<void> {
  const executionContext =
    buildExecutionContext(
      deps,
      {
        correlationId:
          deps.platform + "-member-join-" + member.externalId,
        author: member.user,
        community: member.community
      }
    );

  // The platform identity resolver normally creates the user and
  // membership. Keep an explicit persistence fallback here as well,
  // because member.joined must be enough to register a participant
  // even when the handler is used without a resolver.
  if (
    deps.identityService &&
    deps.membershipService
  ) {
    let user =
      deps.identityService.findUserByIdentity(
        deps.platform,
        member.user.externalId
      );

    if (!user) {
      user =
        deps.identityService.createUser({
          displayName:
            member.user.displayName ??
            member.user.username ??
            member.user.externalId,
          now: member.createdAt
        });

      deps.identityService.attachIdentity({
        userId: user.id,
        platform: deps.platform,
        externalId: member.user.externalId,
        username: member.user.username,
        displayName: member.user.displayName,
        avatarUrl: member.user.avatarUrl,
        now: member.createdAt
      });
    } else {
      deps.identityService.attachIdentity({
        userId: user.id,
        platform: deps.platform,
        externalId: member.user.externalId,
        username: member.user.username,
        displayName: member.user.displayName,
        avatarUrl: member.user.avatarUrl,
        now: member.createdAt
      });
    }

    const community =
      executionContext.community ??
      deps.communityService?.findByIdentity(
        deps.platform,
        member.community.externalId
      );

    if (community) {
      const membership =
        deps.membershipService.findMembership(
          user.id,
          community.id
        );

      if (!membership) {
        deps.membershipService.createMembership({
          userId: user.id,
          communityId: community.id,
          now: member.createdAt
        });
      } else if (
        membership.status === "left" ||
        membership.status === "banned"
      ) {
        // A member.joined event means the platform now considers this
        // account a member (for example, after Modexa's kick flow).
        deps.membershipService.reactivate(
          membership.id,
          member.createdAt
        );
      }
    }
  }

  deps.auditService?.record({
    communityId:
      executionContext.community?.id ?? "system",
    action: "member.join",
    actorUserId:
      executionContext.user.id
  });
}

async function handleMemberLeft(
  deps: PlatformEventHandlerDeps,
  member: AdapterMemberEvent
): Promise<void> {
  if (!deps.identityService || !deps.membershipService) {
    return;
  }

  const community =
    deps.communityService?.findByIdentity(
      deps.platform,
      member.community.externalId
    );

  if (!community) {
    return;
  }

  const user =
    deps.identityService.findUserByIdentity(
      deps.platform,
      member.user.externalId
    );

  if (!user) {
    return;
  }

  const membership =
    deps.membershipService.findMembership(
      user.id,
      community.id
    );

  if (membership && membership.status === "active") {
    deps.membershipService.leave(membership.id);
  }

  deps.auditService?.record({
    communityId: community.id,
    action: "member.leave",
    actorUserId: user.id
  });
}

async function handleMemberBanned(
  deps: PlatformEventHandlerDeps,
  member: AdapterMemberEvent
): Promise<void> {
  if (!deps.identityService || !deps.membershipService) {
    return;
  }

  const community =
    deps.communityService?.findByIdentity(
      deps.platform,
      member.community.externalId
    );

  if (!community) {
    return;
  }

  const user =
    deps.identityService.findUserByIdentity(
      deps.platform,
      member.user.externalId
    );

  if (!user) {
    return;
  }

  const membership =
    deps.membershipService.findMembership(
      user.id,
      community.id
    );

  if (membership && membership.status !== "banned") {
    deps.membershipService.ban(membership.id);
  }

  deps.auditService?.record({
    communityId: community.id,
    action: "member.ban",
    actorUserId: user.id
  });
}

function rememberMessageAuthor(
  deps: PlatformEventHandlerDeps,
  message: AdapterMessage,
  executionContext: ExecutionContext
): void {
  if (
    !deps.identityService ||
    !deps.membershipService ||
    !executionContext.community
  ) {
    return;
  }

  const user =
    deps.identityService.findUserByIdentity(
      deps.platform,
      message.author.externalId
    ) ??
    deps.identityService.createUser({
      displayName:
        message.author.displayName ??
        message.author.username ??
        message.author.externalId,
      now: message.createdAt
    });

  deps.identityService.attachIdentity({
    userId: user.id,
    platform: deps.platform,
    externalId: message.author.externalId,
    username: message.author.username,
    displayName: message.author.displayName,
    avatarUrl: message.author.avatarUrl,
    now: message.createdAt
  });

  const membership =
    deps.membershipService.findMembership(
      user.id,
      executionContext.community.id
    );

  if (!membership) {
    deps.membershipService.createMembership({
      userId: user.id,
      communityId: executionContext.community.id,
      now: message.createdAt
    });
  } else if (
    membership.status === "left" ||
    membership.status === "banned"
  ) {
    // The user has sent a real message, so they are present on-platform.
    deps.membershipService.reactivate(
      membership.id,
      message.createdAt
    );
  }

  deps.logger.debug(
    "member.persistence.synced",
    {
      platform: deps.platform,
      userId: user.id,
      userExternalId: message.author.externalId,
      communityId: executionContext.community.id,
      username: message.author.username
    }
  );
}

async function handleMessageUpdate(
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
    executionContext.community &&
    executionContext.channel
  ) {
    const source =
      deps.bridgeService.findEndpointForExecution(
        executionContext
      );

    if (source) {
      const media =
        message.metadata?.bridgeMedia &&
        typeof message.metadata.bridgeMedia === "object"
          ? message.metadata.bridgeMedia as {
              type?: "image" | "animation" | "video";
              url?: string;
            }
          : undefined;

      await deps.bridgeService.relayMessageUpdate(
        source,
        message.externalId,
        message.author,
        message.content,
        media?.type && media.url
          ? {
              type: media.type,
              url: media.url
            }
          : undefined
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
    executionContext.community &&
    executionContext.channel
  ) {
    const source =
      deps.bridgeService.findEndpointForExecution(
        executionContext
      );

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

  // Every Telegram/Discord user who sends a message becomes a
  // persistent Modexa identity. Subsequent member/moderation commands
  // resolve the stored external ID directly instead of querying the
  // platform again.
  rememberMessageAuthor(
    deps,
    message,
    executionContext
  );

  if (
    deps.bridgeService &&
    message.content &&
    deps.bridgeService.isRelayedMessage(
      message.content
    )
  ) {
    return;
  }

  const bridgeMedia =
    message.metadata?.bridgeMedia &&
    typeof message.metadata.bridgeMedia === "object"
      ? message.metadata.bridgeMedia as {
          type?: "image" | "animation" | "video";
          url?: string;
        }
      : undefined;

  if (
    deps.bridgeService &&
    !message.content.startsWith("/") &&
    (message.content.trim().length > 0 || bridgeMedia?.type)
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
        message.replyTo,
        message.externalId,
        bridgeMedia?.type && bridgeMedia.url
          ? {
              type: bridgeMedia.type,
              url: bridgeMedia.url
            }
          : undefined
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

  if (
    deps.database?.getSystemSetting(
      "maintenance_mode"
    ) === "true" &&
    !executionContext.capabilities.includes(
      "system.manage"
    ) &&
    !input.rawText.toLowerCase().startsWith(
      "/system"
    )
  ) {
    await responder.sendAction({
      type: "message.send",
      platform,
      channelExternalId:
        input.destinationExternalId,
      content:
        translate(
          "system.maintenance.active",
          undefined,
          executionContext.locale
        ),
      replyToExternalId:
        input.replyToExternalId
    });

    return;
  }

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