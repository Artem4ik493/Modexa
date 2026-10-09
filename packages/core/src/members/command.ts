import type { CommandDefinition, CommandResponse } from "../types.js";
import type { AccessControlService } from "../access/service.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import type { PlatformUser } from "../adapters/types.js";
import type { User } from "../identity/types.js";
import { createTranslator } from "../i18n/translate.js";
import type { Logger } from "../diagnostics/types.js";

export interface PlatformMemberDetails {
  user: PlatformUser;
  joinedAt?: Date;
  roles?: string[];
  roleMentions?: string[];
  status?: string;
  isMember?: boolean;
}

export interface MemberDirectory {
  getMember(
    communityExternalId: string,
    userExternalId: string
  ): Promise<PlatformMemberDetails | undefined>;

  listMembers(
    communityExternalId: string
  ): Promise<PlatformMemberDetails[]>;

  findMemberByUsername?(
    communityExternalId: string,
    username: string
  ): Promise<PlatformMemberDetails | undefined>;
}

function formatDate(date: Date | undefined, locale: string): string {
  if (!date) {
    return "—";
  }

  return date.toLocaleString(
    locale === "en" ? "en-US" : "ru-RU"
  );
}

function platformLabel(platform: "telegram" | "discord"): string {
  return platform === "telegram" ? "Telegram" : "Discord";
}

function ensureLocalMember(
  details: PlatformMemberDetails,
  communityId: string,
  identityService: IdentityService,
  membershipService: MembershipService,
  accessControlService?: AccessControlService
) {
  const existing =
    identityService.findUserByIdentity(
      details.user.platform,
      details.user.externalId
    );

  const user =
    existing ??
    identityService.createUser({
      displayName:
        details.user.displayName ??
        details.user.username ??
        details.user.externalId
    });

  if (!existing) {
    identityService.attachIdentity({
      userId: user.id,
      platform: details.user.platform,
      externalId: details.user.externalId,
      username: details.user.username,
      displayName: details.user.displayName,
      avatarUrl: details.user.avatarUrl
    });
  } else {
    identityService.attachIdentity({
      userId: existing.id,
      platform: details.user.platform,
      externalId: details.user.externalId,
      username: details.user.username,
      displayName: details.user.displayName,
      avatarUrl: details.user.avatarUrl
    });
  }

  const membership =
    membershipService.findMembership(
      user.id,
      communityId
    );

  if (details.isMember !== false) {
    if (!membership) {
      membershipService.createMembership({
        userId: user.id,
        communityId,
        now: details.joinedAt
      });
    } else if (membership.status === "left") {
      // The platform lookup confirms the user is present again.
      membershipService.reactivate(membership.id);
    }
  }

  if (
    details.isMember !== false &&
    accessControlService &&
    accessControlService.getUserCommunityRoles(
      user.id,
      communityId
    ).length === 0
  ) {
    const roleId =
      details.user.platformRole === "owner"
        ? `${communityId}:owner`
        : details.user.platformRole === "admin"
          ? `${communityId}:admin`
          : `${communityId}:member`;

    const role =
      accessControlService.getCommunityRole(
        roleId
      );

    if (role) {
      accessControlService.assignCommunityRole(
        user.id,
        role.id
      );
    }
  }

  return user;
}

function renderMemberDetails(
  context: Parameters<NonNullable<CommandDefinition["handler"]>>[0],
  user: User,
  identityService: IdentityService,
  membershipService: MembershipService,
  accessControlService: AccessControlService,
  native?: PlatformMemberDetails
): CommandResponse {
  const t = createTranslator(context.execution.locale);
  const membership =
    membershipService.findMembership(
      user.id,
      context.community!.id
    );

  const roles =
    accessControlService
      .getUserCommunityRoles(
        user.id,
        context.community!.id
      )
      .map((role) => role.name);

  const identity =
    identityService
      .getUserIdentities(user.id)
      .find(
        (item) =>
          item.platform ===
          context.execution.platform
      );

  const nativeRoles =
    native?.roles ?? [];

  return {
    content: [
      `## 👤 ${user.displayName}`,
      identity?.username
        ? `> @${identity.username}`
        : `> ${t("member.username", { username: "—" })}`,
      "",
      `**🆔 ID Modexa:** \`${user.id}\``,
      `**🌐 Платформа:** ${platformLabel(
        context.execution.platform
      )}`,
      `**🛡 Роли Modexa:** ${roles.length > 0
        ? roles.join(", ")
        : t("member.no_roles")}`,
      `**📅 В Modexa:** ${formatDate(
        membership?.joinedAt,
        context.execution.locale ?? "ru"
      )}`,
      "",
      `**🎭 Роли платформы:** ${nativeRoles.length > 0
        ? (native?.roleMentions ?? nativeRoles.map((role) => `@${role.replace(/^@/, "")}`)).join(", ")
        : t("member.no_platform_roles")}`,
      `**📅 В платформе:** ${formatDate(
        native?.joinedAt,
        context.execution.locale ?? "ru"
      )}`,
      `**🟢 Статус:** ${native?.status ?? "—"}`
    ].join("\n"),
    format: "markdown",
    imageUrl:
      identity?.avatarUrl,
    buttons: [
      {
        id: "member.refresh",
        label:
          context.execution.locale === "en"
            ? "🔄 Refresh"
            : "🔄 Обновить",
        action: {
          type: "command",
          command: "member",
          args: [
            identity?.externalId ?? user.id
          ]
        }
      },
      {
        id: "member.list",
        label:
          context.execution.locale === "en"
            ? "👥 Members"
            : "👥 Участники",
        action: {
          type: "command",
          command: "members"
        }
      }
    ]
  };
}

export function createMemberCommand(
  identityService: IdentityService,
  membershipService: MembershipService,
  accessControlService: AccessControlService,
  memberDirectory?: MemberDirectory,
  logger?: Logger
): CommandDefinition {
  return {
    name: "member",
    descriptionKey: "command.member.description",
    requiredPermissions: ["member.view"],
    handler: async (context): Promise<CommandResponse> => {
      const t = createTranslator(context.execution.locale);

      if (
        context.execution.type !== "community" ||
        !context.community
      ) {
        return {
          content: t("member.community_only")
        };
      }

      const rawTarget = context.args[0]?.trim();
      const target = rawTarget
        ?.replace(/^<@!?/, "")
        .replace(/>$/, "")
        .replace(/^@/, "")
        .trim();

      let user: User | undefined;
      let native: PlatformMemberDetails | undefined;

      // Lookup #1: persisted Modexa identity.
      if (target) {
        // First try the persisted username index, then a persisted
        // platform external ID. This must work after a restart too.
        user =
          identityService.findUserByUsername(
            target,
            context.execution.platform
          ) ??
          identityService.findUserByIdentity(
            context.execution.platform,
            target
          );

        if (!user) {
          logger?.warn(
            "member.lookup.local.not_found",
            {
              platform: context.execution.platform,
              communityId: context.community.id,
              username: target
            }
          );
        }
      } else {
        // /member without an argument means "me". The execution
        // context already contains the real Modexa user, but hydrate
        // it from the persisted platform identity when this is a
        // fresh process or a separately restored runtime.
        user =
          identityService.getUser(context.user.id) ??
          identityService.findUserByIdentity(
            context.execution.platform,
            context.user.id
          ) ??
          context.user;

        const persistedIdentity =
          identityService
            .getUserIdentities(user.id)
            .find(
              (identity) =>
                identity.platform ===
                context.execution.platform
            );

        if (!persistedIdentity) {
          logger?.warn(
            "member.lookup.self_identity.not_found",
            {
              platform: context.execution.platform,
              communityId: context.community.id,
              userId: user.id,
              externalId: context.user.id
            }
          );
        }
      }

      // Lookup #2: persisted community membership. This catches
      // participants whose identity profile is present only through
      // the community membership cache/database.
      if (!user && target) {
        user = membershipService
          .getCommunityMemberships(context.community.id)
          .map((membership) =>
            identityService.getUser(membership.userId)
          )
          .filter(
            (candidate): candidate is NonNullable<typeof candidate> =>
              Boolean(candidate)
          )
          .find((candidate) =>
            identityService
              .getUserIdentities(candidate.id)
              .some(
                (identity) =>
                  identity.platform === context.execution.platform &&
                  identity.username?.toLowerCase() === target.toLowerCase()
              )
          );

        if (!user) {
          logger?.warn(
            "member.lookup.membership.not_found",
            {
              platform: context.execution.platform,
              communityId: context.community.id,
              username: target
            }
          );
        }
      }

      // Lookup #3: native platform directory.
      if (!user && target && memberDirectory) {
        try {
          native =
            /^\d+$/.test(target)
              ? await memberDirectory.getMember(
                  context.community.id,
                  target
                )
              : await memberDirectory.findMemberByUsername?.(
                  context.community.id,
                  target
                );

          if (native) {
            user = ensureLocalMember(
              native,
              context.community.id,
              identityService,
              membershipService,
              accessControlService
            );
          } else {
            logger?.warn(
              "member.lookup.native.not_found",
              {
                platform: context.execution.platform,
                communityId: context.community.id,
                username: target
              }
            );
          }
        } catch (error) {
          logger?.error(
            "member.lookup.native.failed",
            {
              platform: context.execution.platform,
              communityId: context.community.id,
              username: target
            },
            error
          );
        }
      }

      if (!user) {
        return {
          content: t("member.not_found", {
            username: target ?? ""
          })
        };
      }

      const identity =
        identityService
          .getUserIdentities(user.id)
          .find(
            (item) =>
              item.platform ===
              context.execution.platform
          );

      if (
        memberDirectory &&
        identity
      ) {
        native =
          await memberDirectory.getMember(
            context.community.id,
            identity.externalId
          );

        if (native) {
          ensureLocalMember(
            native,
            context.community.id,
            identityService,
            membershipService,
            accessControlService
          );
        }
      }

      return renderMemberDetails(
        context,
        user,
        identityService,
        membershipService,
        accessControlService,
        native
      );
    }
  };
}

export function createMembersCommand(
  identityService: IdentityService,
  membershipService: MembershipService,
  accessControlService: AccessControlService,
  memberDirectory?: MemberDirectory
): CommandDefinition {
  return {
    name: "members",
    descriptionKey: "command.members.description",
    requiredPermissions: ["member.view"],
    handler: async (context): Promise<CommandResponse> => {
      const t = createTranslator(context.execution.locale);

      if (
        context.execution.type !== "community" ||
        !context.community
      ) {
        return {
          content: t("members.community_only")
        };
      }

      const pageSize = 10;
      let page = 1;
      let search = "";

      const firstArg = context.args[0]?.trim();

      if (firstArg && /^\d+$/.test(firstArg)) {
        page = Math.max(1, Number(firstArg));
        search = context.args.slice(1).join(" ").trim();
      } else {
        search = context.args.join(" ").trim();
      }

      const nativeMembers =
        memberDirectory
          ? await memberDirectory.listMembers(
              context.community.id
            )
          : [];

      const nativeByExternalId =
        new Map(
          nativeMembers.map((item) => [
            item.user.externalId,
            item
          ])
        );

      for (const details of nativeMembers) {
        try {
          ensureLocalMember(
            details,
            context.community.id,
            identityService,
            membershipService,
            accessControlService
          );
        } catch {
          // A platform member can already belong to another
          // Modexa identity. Keep the local member list intact.
        }
      }

      const memberships =
        membershipService
          .getCommunityMemberships(
            context.community.id
          )
          .filter(
            (membership) =>
              membership.status !== "left"
          )
          .map((membership) => {
            const user =
              identityService.getUser(
                membership.userId
              );

            if (!user) {
              return undefined;
            }

            const identity =
              identityService
                .getUserIdentities(
                  user.id
                )
                .find(
                  (item) =>
                    item.platform ===
                    context.execution.platform
                );

            return {
              membership,
              user,
              identity,
              native:
                identity
                  ? nativeByExternalId.get(
                      identity.externalId
                    )
                  : undefined
            };
          })
          .filter(
            (
              item
            ): item is NonNullable<typeof item> =>
              item !== undefined
          );

      const normalizedSearch =
        search.toLowerCase();

      const filtered =
        memberships.filter((item) => {
          if (!normalizedSearch) {
            return true;
          }

          const username =
            item.identity?.username ??
            "";

          return [
            item.user.displayName,
            username,
            item.user.id
          ].some((value) =>
            value
              .toLowerCase()
              .includes(normalizedSearch)
          );
        });

      filtered.sort((a, b) =>
        a.user.displayName.localeCompare(
          b.user.displayName,
          context.execution.locale === "en"
            ? "en-US"
            : "ru-RU"
        )
      );

      const totalPages =
        Math.max(
          1,
          Math.ceil(
            filtered.length /
              pageSize
          )
        );

      if (page > totalPages) {
        return {
          content: t("members.page_not_found", {
            page,
            total: totalPages
          })
        };
      }

      const start =
        (page - 1) * pageSize;

      const entries =
        filtered.slice(
          start,
          start + pageSize
        );

      const lines =
        entries.map((item, index) => {
          const username =
            item.identity?.username
              ? `@${item.identity.username}`
              : item.user.displayName;

          const nativeRoles =
            item.native?.roleMentions ??
            (item.native?.roles ?? []).map((role) => `@${role.replace(/^@/, "")}`);

          const roles =
            accessControlService
              .getUserCommunityRoles(
                item.user.id,
                context.community!.id
              )
              .map((role) => role.name);

          const nativeSuffix =
            nativeRoles.length > 0
              ? ` · ${nativeRoles.join(", ")}`
              : "";

          const displayName = item.user.displayName && item.user.displayName !== username ? ` (${item.user.displayName})` : "";

          return `${start + index + 1}. ${username}${displayName} — ${roles.length > 0 ? roles.join(", ") : t("member.no_roles")}${nativeSuffix}`;
        });

      const pageText =
        t("members.page", {
          page,
          total: totalPages
        });

      const buttons = [];

      if (page > 1) {
        buttons.push({
          id: "members.previous",
          label: t("members.previous"),
          action: {
            type: "command" as const,
            command: "/members",
            args: [String(page - 1), ...(search ? [search] : [])]
          }
        });
      }

      if (page < totalPages) {
        buttons.push({
          id: "members.next",
          label: t("members.next"),
          action: {
            type: "command" as const,
            command: "/members",
            args: [String(page + 1), ...(search ? [search] : [])]
          }
        });
      }

      buttons.push({
        id: "members.menu",
        label: t("menu.back"),
        action: {
          type: "command" as const,
          command: "/menu"
        }
      });

      return {
        content: [
          t("members.title", {
            count: filtered.length
          }),
          lines.length > 0
            ? lines.join("\n")
            : t("members.empty"),
          pageText
        ].join("\n"),
        buttons
      };
    }
  };
}
