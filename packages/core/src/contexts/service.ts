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
    "billing"
  ];

const COMMUNITY_CAPABILITIES:
  ExecutionCapability[] = [
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
    [
      "bridge.view",
      "bridge"
    ],
    [
      "bridge.manage",
      "bridge"
    ],
    [
      "moderation.warn",
      "moderation"
    ],
    [
      "moderation.mute",
      "moderation"
    ],
    [
      "moderation.kick",
      "moderation"
    ],
    [
      "moderation.ban",
      "moderation"
    ]
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
          )
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
      capabilities
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
      context.type ===
        "community" &&
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
    if (!this.communityAccess) {
      return [
        ...COMMUNITY_CAPABILITIES
      ];
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