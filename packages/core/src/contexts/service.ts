import type {
  CommunityAccessService
} from "../access/community-access.js";

import type {
  Permission
} from "../access/types.js";

import {
  MODEXA_OWNER_ROLE_ID,
  type AccessControlService
} from "../access/index.js";

import {
  DEFAULT_LOCALE
} from "../i18n/locale.js";

import type {
  ExecutionCapability,
  ExecutionContext,
  CreateExecutionContextInput
} from "./types.js";

const DM_CAPABILITIES:
  ExecutionCapability[] = [
    "commands",
    "account.manage",
    "identity.link",
    "identity.unlink",
    "billing"
  ];

const COMMUNITY_CAPABILITY_PERMISSIONS:
  Array<
    readonly [
      Permission,
      ExecutionCapability
    ]
  > = [
    [
      "community.view",
      "community.view"
    ],
    [
      "community.manage",
      "community.manage"
    ],
    [
      "member.view",
      "member.view"
    ],
    [
      "member.manage",
      "member.manage"
    ],
    [
      "commands.use",
      "commands"
    ],
    ["bridge.view", "bridge.view"],
    ["bridge.manage", "bridge.manage"],
    ["commands.manage", "commands.manage"],
    ["moderation.view", "moderation.view"],
    ["moderation.warn", "moderation.warn"],
    ["moderation.mute", "moderation.mute"],
    ["moderation.kick", "moderation.kick"],
    ["moderation.ban", "moderation.ban"],
    ["moderation.clear", "moderation.clear"]
  ];

export class ExecutionContextService {
  constructor(
    private readonly communityAccess?:
      CommunityAccessService,
    private readonly accessControl?:
      AccessControlService
  ) {}

  create(
    input: CreateExecutionContextInput
  ): ExecutionContext {
    const locale =
      input.locale ??
      DEFAULT_LOCALE;

    if (!input.community) {
      return {
        type: "dm",
        platform:
          input.platform,
        correlationId:
          input.correlationId,
        user:
          input.user,
        locale,
        capabilities:
          this.getDmCapabilities(
            input.user.id
          ),
        permissions: []
      };
    }

    const capabilities =
      this.getCommunityCapabilities(
        input.user.id,
        input.community.id
      );

    if (
      this.accessControl?.hasSystemRole(
        input.user.id,
        MODEXA_OWNER_ROLE_ID
      )
    ) {
      capabilities.push(
        "system.manage"
      );
    }

    return {
      type: "community",
      platform:
        input.platform,
      correlationId:
        input.correlationId,
      user:
        input.user,
      community:
        input.community,
      channel:
        input.channel,
      locale,
      capabilities,
      permissions: this.getCommunityPermissions(
        input.user.id,
        input.community.id
      )
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
    return context.type === "community" &&
      (context.permissions ?? []).some((permission) =>
        permission === "moderation.warn" ||
        permission === "moderation.mute" ||
        permission === "moderation.kick" ||
        permission === "moderation.ban" ||
        permission === "moderation.clear"
      );
  }

  canManageCommunity(
    context: ExecutionContext
  ): boolean {
    return (
      context.type ===
        "community" &&
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
      context.type ===
        "community" &&
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
      | "moderation.clear"
      | "bridge.view"
      | "bridge.manage"
      | "commands.use"
  ): boolean {
    if (
      context.type !==
        "community" ||
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

  private getDmCapabilities(
    userId: string
  ): ExecutionCapability[] {
    const capabilities =
      [...DM_CAPABILITIES];

    if (
      this.accessControl?.hasSystemRole(
        userId,
        MODEXA_OWNER_ROLE_ID
      )
    ) {
      capabilities.push(
        "system.manage"
      );
    }

    return capabilities;
  }

  private getCommunityPermissions(
    userId: string,
    communityId: string
  ): Permission[] {
    if (!this.communityAccess) {
      return [];
    }

    const permissions: Permission[] = [
      "community.view",
      "community.manage",
      "member.view",
      "member.manage",
      "moderation.view",
      "moderation.warn",
      "moderation.mute",
      "moderation.kick",
      "moderation.ban",
      "moderation.clear",
      "commands.use",
      "commands.manage",
      "bridge.view",
      "bridge.manage"
    ];

    return permissions.filter((permission) =>
      this.communityAccess!.can(userId, communityId, permission)
    );
  }

  private getCommunityCapabilities(
    userId: string,
    communityId: string
  ): ExecutionCapability[] {
    /**
     * ExecutionContextService is still usable directly in
     * isolated Core tests and low-level consumers that don't
     * construct the full runtime.
     *
     * The real runtime always supplies CommunityAccessService,
     * so production authorization is permission-based.
     */
    // Fail closed if the runtime has no access service.
    if (!this.communityAccess) {
      return ["commands"];
    }

    const capabilities =
      new Set<ExecutionCapability>();

    for (
      const [
        permission,
        capability
      ] of
        COMMUNITY_CAPABILITY_PERMISSIONS
    ) {
      if (
        this.communityAccess.can(
          userId,
          communityId,
          permission
        )
      ) {
        capabilities.add(
          capability
        );
      }
    }

    return [
      ...capabilities
    ];
  }
}