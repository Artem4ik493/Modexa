import type { CommunityAccessService } from "../access/community-access.js";

import type {
  ExecutionCapability,
  ExecutionContext,
  CreateExecutionContextInput
} from "./types.js";

const DM_CAPABILITIES: ExecutionCapability[] = [
  "commands",
  "account.manage",
  "identity.link",
  "billing"
];

const COMMUNITY_CAPABILITIES: ExecutionCapability[] = [
  "commands",
  "community.view",
  "community.manage",
  "member.view",
  "member.manage",
  "moderation",
  "bridge",
  "automations",
  "billing"
];

export class ExecutionContextService {
  constructor(
    private readonly communityAccess?: CommunityAccessService
  ) {}

  create(
    input: CreateExecutionContextInput
  ): ExecutionContext {
    if (!input.community) {
      return {
        type: "dm",
        platform: input.platform,
        correlationId: input.correlationId,
        user: input.user,
        capabilities: [...DM_CAPABILITIES]
      };
    }

    return {
      type: "community",
      platform: input.platform,
      correlationId: input.correlationId,
      user: input.user,
      community: input.community,
      channel: input.channel,
      capabilities: [...COMMUNITY_CAPABILITIES]
    };
  }

  hasCapability(
    context: ExecutionContext,
    capability: ExecutionCapability
  ): boolean {
    return context.capabilities.includes(
      capability
    );
  }

  canModerate(
    context: ExecutionContext
  ): boolean {
    return (
      context.type === "community" &&
      this.hasCapability(
        context,
        "moderation"
      )
    );
  }

  canManageCommunity(
    context: ExecutionContext
  ): boolean {
    return (
      context.type === "community" &&
      this.hasCapability(
        context,
        "community.manage"
      )
    );
  }

  canManageMembers(
    context: ExecutionContext
  ): boolean {
    return (
      context.type === "community" &&
      this.hasCapability(
        context,
        "member.manage"
      )
    );
  }

  hasCommunityPermission(
    context: ExecutionContext,
    permission:
      | "community.view"
      | "community.manage"
      | "member.view"
      | "member.manage"
      | "moderation.warn"
      | "moderation.mute"
      | "moderation.kick"
      | "moderation.ban"
      | "bridge.view"
      | "bridge.manage"
      | "commands.use"
  ): boolean {
    if (
      context.type !== "community" ||
      !context.community ||
      !this.communityAccess
    ) {
      return false;
    }

    return this.communityAccess.can(
      context.user.id,
      context.community.id,
      permission
    );
  }
}