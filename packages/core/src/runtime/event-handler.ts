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

import type { AutoModRule, AutoModService } from "../moderation/automod.js";

const EMPTY_CONTENT_FALLBACK =
  "…";

type WelcomeRuntimeSettings = {
  enabled?: boolean; message?: string; leaveEnabled?: boolean; leaveMessage?: string;
  channelId?: string;
  // Legacy shared embed fields remain supported for existing saved settings.
  embedEnabled?: boolean; embedTitle?: string; embedDescription?: string;
  embedColor?: string; embedFooter?: string; embedThumbnailUrl?: string; embedImageUrl?: string;
  welcomeEmbedEnabled?: boolean; welcomeEmbedTitle?: string; welcomeEmbedDescription?: string;
  welcomeEmbedColor?: string; welcomeEmbedFooter?: string; welcomeEmbedThumbnailUrl?: string; welcomeEmbedImageUrl?: string;
  leaveEmbedEnabled?: boolean; leaveEmbedTitle?: string; leaveEmbedDescription?: string;
  leaveEmbedColor?: string; leaveEmbedFooter?: string; leaveEmbedThumbnailUrl?: string; leaveEmbedImageUrl?: string;
};

function renderWelcomeTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key: string) => variables[key] ?? "");
}

async function sendWelcomeLifecycleMessage(
  deps: PlatformEventHandlerDeps,
  communityId: string | undefined,
  member: AdapterMemberEvent,
  kind: "join" | "leave"
): Promise<void> {
  if (!deps.database) {
    deps.logger.warn("welcome.message.skipped", { platform: deps.platform, kind, communityExternalId: member.community.externalId, reason: "database_unavailable" });
    return;
  }
  // Dashboard settings are keyed by the internal Modexa community ID.
  // Resolve that ID from the platform identity if lifecycle context is incomplete.
  const communities = deps.database.getCommunitiesSnapshot();
  const matchingCommunity = communities.find((item) => item.id === communityId) ?? communities.find((item) =>
    item.identities.some((identity) => identity.platform === deps.platform && identity.externalId === member.community.externalId)
  );
  const settingsCommunityId = matchingCommunity?.id ?? communityId;
  if (!settingsCommunityId) {
    deps.logger.warn("welcome.message.skipped", { platform: deps.platform, kind, communityExternalId: member.community.externalId, reason: "community_resolution_failed" });
    return;
  }
  const settings = deps.database.getRuntimeState<WelcomeRuntimeSettings>("api.welcome." + settingsCommunityId);
  if (!settings) {
    deps.logger.info("welcome.message.skipped", { platform: deps.platform, kind, communityId: settingsCommunityId, communityExternalId: member.community.externalId, reason: "settings_not_found" });
    return;
  }
  if (!(kind === "join" ? settings.enabled : settings.leaveEnabled)) {
    deps.logger.debug("welcome.message.skipped", { platform: deps.platform, kind, communityId: settingsCommunityId, reason: "feature_disabled" });
    return;
  }
  const contentTemplate = kind === "join" ? settings.message : settings.leaveMessage;
  if (!contentTemplate?.trim()) {
    deps.logger.warn("welcome.message.skipped", { platform: deps.platform, kind, communityId: settingsCommunityId, reason: "message_empty" });
    return;
  }
  const channelExternalId = settings.channelId?.trim() || member.community.externalId;
  const displayName = member.user.displayName || member.user.username || member.user.externalId;
  const variables = { member: displayName, username: member.user.username || displayName, community: member.community.name || communityId };
  const content = renderWelcomeTemplate(contentTemplate, variables);
  const metadata: Record<string, unknown> = {};
  // Each lifecycle message has its own editor. Old settings remain the fallback
  // so communities do not lose their existing welcome embed after upgrading.
  const legacyEmbed = settings.embedEnabled;
  const embedEnabled = kind === "join"
    ? (settings.welcomeEmbedEnabled ?? legacyEmbed)
    : (settings.leaveEmbedEnabled ?? legacyEmbed);
  const titleTemplate = kind === "join" ? (settings.welcomeEmbedTitle ?? settings.embedTitle) : (settings.leaveEmbedTitle ?? settings.embedTitle);
  const descriptionTemplate = kind === "join" ? (settings.welcomeEmbedDescription ?? settings.embedDescription) : (settings.leaveEmbedDescription ?? settings.embedDescription);
  const colorValue = kind === "join" ? (settings.welcomeEmbedColor ?? settings.embedColor) : (settings.leaveEmbedColor ?? settings.embedColor);
  const footerTemplate = kind === "join" ? (settings.welcomeEmbedFooter ?? settings.embedFooter) : (settings.leaveEmbedFooter ?? settings.embedFooter);
  const thumbnailUrl = kind === "join" ? (settings.welcomeEmbedThumbnailUrl ?? settings.embedThumbnailUrl) : (settings.leaveEmbedThumbnailUrl ?? settings.embedThumbnailUrl);
  const imageUrl = kind === "join" ? (settings.welcomeEmbedImageUrl ?? settings.embedImageUrl) : (settings.leaveEmbedImageUrl ?? settings.embedImageUrl);
  const useEmbed = Boolean(embedEnabled && deps.platform === "discord");
  if (useEmbed) {
    const embed: Record<string, unknown> = {};
    const title = titleTemplate ? renderWelcomeTemplate(titleTemplate, variables) : "";
    const description = descriptionTemplate ? renderWelcomeTemplate(descriptionTemplate, variables) : content;
    const footer = footerTemplate ? renderWelcomeTemplate(footerTemplate, variables) : "";
    if (title) embed.title = title.slice(0, 256);
    if (description) embed.description = description.slice(0, 4096);
    const color = colorValue?.trim().replace(/^#/, "");
    if (color && /^[0-9a-fA-F]{6}$/.test(color)) embed.color = Number.parseInt(color, 16);
    if (footer) embed.footer = footer.slice(0, 2048);
    if (thumbnailUrl && /^https?:\/\//i.test(thumbnailUrl)) embed.thumbnailUrl = thumbnailUrl;
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) embed.imageUrl = imageUrl;
    metadata.discord = { embed };
  }
  try {
    await deps.responder.sendAction({
      type: "message.send", platform: deps.platform, channelExternalId,
      content: useEmbed ? "" : content,
      ...(Object.keys(metadata).length ? { metadata } : {})
    });
    deps.logger.info("welcome.message.sent", { platform: deps.platform, communityId, communityExternalId: member.community.externalId, userExternalId: member.user.externalId, kind, channelExternalId, embed: useEmbed });
  } catch (error) {
    deps.logger.error("welcome.message.failed", { platform: deps.platform, communityId: settingsCommunityId, communityExternalId: member.community.externalId, communityName: member.community.name, userExternalId: member.user.externalId, kind, channelExternalId, embed: useEmbed }, error);
  }
}

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

  autoModService?: AutoModService;

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

        case "member.unbanned":
          await handleMemberUnbanned(deps, event.member);
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

  reactivateMembership?: boolean;
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
        input.channel,
      reactivateMembership:
        input.reactivateMembership
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

  const executionContext = createPlatformExecutionContext(
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

  const savedLocale = deps.database?.getUserSetting(executionContext.user.id, "locale");
  if (savedLocale === "ru" || savedLocale === "en") {
    executionContext.locale = savedLocale;
  }

  return executionContext;
}

async function handleMemberJoined(
  deps: PlatformEventHandlerDeps,
  member: AdapterMemberEvent
): Promise<void> {
  deps.logger.debug("member.lifecycle.received", {
    platform: deps.platform,
    adapterId: deps.responder.id,
    event: "joined",
    userExternalId: member.user.externalId,
    communityExternalId: member.community.externalId,
    occurredAt: member.createdAt.toISOString()
  });

  const executionContext =
    buildExecutionContext(
      deps,
      {
        correlationId:
          deps.platform + "-member-join-" + member.externalId,
        author: member.user,
        community: member.community,
        reactivateMembership: true
      }
    );

  await sendWelcomeLifecycleMessage(deps, executionContext.community?.id, member, "join");

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

  const finalMembership = executionContext.community
    ? deps.membershipService?.findMembership(
        executionContext.user.id,
        executionContext.community.id
      )
    : undefined;

  deps.logger.info("member.lifecycle.synced", {
    platform: deps.platform,
    event: "joined",
    userId: executionContext.user.id,
    userExternalId: member.user.externalId,
    communityId: executionContext.community?.id,
    communityExternalId: member.community.externalId,
    previousStatus: "unknown",
    status: finalMembership?.status ?? "unavailable"
  });

  deps.auditService?.record({
    communityId: executionContext.community?.id ?? "system",
    action: "member.join",
    actorUserId: executionContext.user.id
  });
}

async function handleMemberLeft(
  deps: PlatformEventHandlerDeps,
  member: AdapterMemberEvent
): Promise<void> {
  deps.logger.debug("member.lifecycle.received", {
    platform: deps.platform,
    adapterId: deps.responder.id,
    event: "left",
    userExternalId: member.user.externalId,
    communityExternalId: member.community.externalId,
    occurredAt: member.createdAt.toISOString()
  });

  const executionContext = buildExecutionContext(deps, {
    correlationId: `${deps.platform}-member-left-${member.externalId}`,
    author: member.user,
    community: member.community
  });
  const community = executionContext.community;
  const user = executionContext.user;

  await sendWelcomeLifecycleMessage(deps, community?.id, member, "leave");

  if (!community || !deps.membershipService) {
    deps.logger.warn("member.lifecycle.sync_skipped", {
      platform: deps.platform,
      event: "left",
      userId: user.id,
      communityExternalId: member.community.externalId,
      reason: !community ? "community_resolution_failed" : "membership_service_missing"
    });
    return;
  }

  const membership = deps.membershipService.findMembership(user.id, community.id);
  const previousStatus = membership?.status ?? "missing";

  if (membership?.status === "active") {
    deps.membershipService.leave(membership.id);
  }

  const current = deps.membershipService.findMembership(user.id, community.id);
  deps.logger.info("member.lifecycle.synced", {
    platform: deps.platform,
    event: "left",
    userId: user.id,
    userExternalId: member.user.externalId,
    communityId: community.id,
    communityExternalId: member.community.externalId,
    previousStatus,
    status: current?.status ?? "missing"
  });

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
  deps.logger.debug("member.lifecycle.received", {
    platform: deps.platform,
    adapterId: deps.responder.id,
    event: "banned",
    userExternalId: member.user.externalId,
    communityExternalId: member.community.externalId,
    occurredAt: member.createdAt.toISOString(),
    platformStatus: member.metadata?.status
  });

  const executionContext = buildExecutionContext(deps, {
    correlationId: `${deps.platform}-member-banned-${member.externalId}`,
    author: member.user,
    community: member.community
  });
  const community = executionContext.community;
  const user = executionContext.user;

  if (!community || !deps.membershipService) {
    deps.logger.warn("member.lifecycle.sync_skipped", {
      platform: deps.platform,
      event: "banned",
      userId: user.id,
      communityExternalId: member.community.externalId,
      reason: !community ? "community_resolution_failed" : "membership_service_missing"
    });
    return;
  }

  const membership = deps.membershipService.findMembership(user.id, community.id);
  const previousStatus = membership?.status ?? "missing";

  if (membership && membership.status !== "banned") {
    deps.membershipService.ban(membership.id);
  }

  const current = deps.membershipService.findMembership(user.id, community.id);
  deps.logger.info("member.lifecycle.synced", {
    platform: deps.platform,
    event: "banned",
    userId: user.id,
    userExternalId: member.user.externalId,
    communityId: community.id,
    communityExternalId: member.community.externalId,
    previousStatus,
    status: current?.status ?? "missing"
  });

  deps.auditService?.record({
    communityId: community.id,
    action: "member.ban",
    actorUserId: user.id
  });
}

async function handleMemberUnbanned(
  deps: PlatformEventHandlerDeps,
  member: AdapterMemberEvent
): Promise<void> {
  deps.logger.debug("member.lifecycle.received", {
    platform: deps.platform,
    adapterId: deps.responder.id,
    event: "unbanned",
    userExternalId: member.user.externalId,
    communityExternalId: member.community.externalId,
    occurredAt: member.createdAt.toISOString()
  });

  const executionContext = buildExecutionContext(deps, {
    correlationId: `${deps.platform}-member-unbanned-${member.externalId}`,
    author: member.user,
    community: member.community
  });
  const community = executionContext.community;
  const user = executionContext.user;

  if (!community || !deps.membershipService) {
    deps.logger.warn("member.lifecycle.sync_skipped", {
      platform: deps.platform,
      event: "unbanned",
      userId: user.id,
      communityExternalId: member.community.externalId,
      reason: !community ? "community_resolution_failed" : "membership_service_missing"
    });
    return;
  }

  const membership = deps.membershipService.findMembership(user.id, community.id);
  const previousStatus = membership?.status ?? "missing";
  if (membership && (membership.status === "banned" || membership.status === "active")) {
    deps.membershipService.leave(membership.id, member.createdAt);
  }

  const current = deps.membershipService.findMembership(user.id, community.id);
  deps.logger.info("member.lifecycle.synced", {
    platform: deps.platform,
    event: "unbanned",
    userId: user.id,
    userExternalId: member.user.externalId,
    communityId: community.id,
    communityExternalId: member.community.externalId,
    previousStatus,
    status: current?.status ?? "missing",
    note: "unban_does_not_imply_membership"
  });

  deps.auditService?.record({
    communityId: community.id,
    action: "member.unban",
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

async function applyAutoMod(
  deps: PlatformEventHandlerDeps,
  message: AdapterMessage,
  executionContext: ExecutionContext
): Promise<boolean> {
  const community = executionContext.community;
  const service = deps.autoModService;
  if (!service || !community || !message.content.trim() || message.content.trimStart().startsWith("/")) return false;

  // API and adapters may run as separate processes against the same SQLite database.
  // Refresh the selected community's rules per message so Dashboard changes take effect
  // without restarting the bots and without sharing in-memory state between processes.
  if (deps.database) {
    const stored = deps.database.getRuntimeState<AutoModRule[]>("api.automod_rules");
    if (Array.isArray(stored)) service.syncCommunityRules(community.id, stored);
  }

  const rawMentionCount = Number(message.metadata?.mentionCount ?? 0);
  const mentionCount = Number.isFinite(rawMentionCount) && rawMentionCount > 0 ? rawMentionCount : 0;
  const roleIds = Array.isArray(message.metadata?.authorRoleIds)
    ? message.metadata.authorRoleIds.filter((value): value is string => typeof value === "string")
    : [];
  const decision = await service.inspectAsync({
    communityId: community.id,
    userId: message.author.externalId,
    channelId: message.channel?.externalId,
    roleIds,
    content: message.content,
    mentionCount,
    now: message.createdAt
  });
  if (!decision.matched || !decision.rule) return false;

  const rule = decision.rule;
  const ruleLabels: Record<AutoModRule["type"], string> = {
    keyword: "запрещённые слова", link: "нежелательные ссылки", invite: "ссылки-приглашения",
    scam: "скам и фишинг", caps: "избыточные заглавные буквы", flood: "флуд",
    repeated_text: "повтор сообщений", emotes: "чрезмерное количество эмодзи",
    mentions: "массовые упоминания", zalgo: "искажённый текст"
  };
  const reason = `Автоматическая модерация: ${ruleLabels[rule.type]}.`;
  const targetDisplayName = message.author.displayName ?? message.author.username ?? message.author.externalId;
  try {
    if (rule.action === "delete") {
      await deps.responder.sendAction({
        type: "message.delete", platform: deps.platform,
        channelExternalId: message.destinationExternalId, messageExternalId: message.externalId
      });
    } else if (rule.action === "warn") {
      await deps.responder.sendAction({
        type: "member.warn", platform: deps.platform,
        communityExternalId: message.community?.externalId ?? "",
        userExternalId: message.author.externalId, reason,
        metadata: { targetDisplayName, source: "automod", ruleId: rule.id }
      });
    } else if (rule.action === "mute") {
      await deps.responder.sendAction({
        type: "member.mute", platform: deps.platform,
        communityExternalId: message.community?.externalId ?? "",
        userExternalId: message.author.externalId,
        durationSeconds: Math.max(30, rule.durationSeconds ?? 600), reason,
        metadata: { targetDisplayName, source: "automod", ruleId: rule.id }
      });
    } else if (rule.action === "kick") {
      await deps.responder.sendAction({
        type: "member.kick", platform: deps.platform,
        communityExternalId: message.community?.externalId ?? "",
        userExternalId: message.author.externalId, reason,
        metadata: { targetDisplayName, source: "automod", ruleId: rule.id }
      });
    } else if (rule.action === "ban") {
      await deps.responder.sendAction({
        type: "member.ban", platform: deps.platform,
        communityExternalId: message.community?.externalId ?? "",
        userExternalId: message.author.externalId, reason,
        metadata: { targetDisplayName, source: "automod", ruleId: rule.id }
      });
    }

    deps.auditService?.record({
      communityId: community.id, action: "automod.trigger", actorUserId: executionContext.user.id,
      channelId: message.channel?.externalId, messageId: message.externalId, reason,
      metadata: { platform: deps.platform, ruleId: rule.id, ruleType: rule.type, action: rule.action, matched: true, success: true }
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    deps.logger.warn("automod.action.failed", {
      platform: deps.platform, communityId: community.id, ruleId: rule.id,
      ruleType: rule.type, action: rule.action, failure
    });
    deps.auditService?.record({
      communityId: community.id, action: "automod.trigger", actorUserId: executionContext.user.id,
      channelId: message.channel?.externalId, messageId: message.externalId,
      reason: reason + " — действие не выполнено",
      metadata: { platform: deps.platform, ruleId: rule.id, ruleType: rule.type, action: rule.action, matched: true, success: false, failure: failure.slice(0, 500) }
    });
  }
  return true;
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

  if (await applyAutoMod(deps, message, executionContext)) return;

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
          message.channel,
        reactivateMembership: true
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

  // AutoMod must run before relay and command handling.
  if (await applyAutoMod(deps, message, executionContext)) return;

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
          invocation.channel,
        reactivateMembership: true
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
          interaction.channel,
        reactivateMembership: true
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