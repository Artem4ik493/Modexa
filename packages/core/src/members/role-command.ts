import type { CommandContext, CommandDefinition, CommandResponse } from "../types.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import type { AccessControlService } from "../access/service.js";
import { createBuiltinCommunityRoles } from "../access/community-roles.js";
import type { MemberDirectory } from "./command.js";

export function createRoleCommand(
  identityService: IdentityService,
  membershipService: MembershipService,
  accessControlService: AccessControlService,
  memberDirectory?: MemberDirectory
): CommandDefinition {
  return {
    name: "role",
    description: "View or change a community role",
    requiredCapabilities: ["member.view"],
    handler: async (context: CommandContext): Promise<CommandResponse> => {
      if (!context.community) return { content: "Команду /role можно использовать только в сообществе." };

      const targetArg = context.args[0];
      const requestedRole = context.args[1]?.toUpperCase();
      if (!targetArg) return { content: "Использование: /role @user [member|moderator]" };

      const normalizedTarget = targetArg
        .replace(/^@/, "")
        .trim()
        .toLowerCase();

      let target =
        identityService.findUserByIdentity(context.platform, targetArg) ??
        identityService.findUserByUsername(
          normalizedTarget,
          context.platform
        );

      // Telegram cannot search arbitrary group members by username via
      // Bot API, so fall back to users already known in this community.
      if (!target) {
        target = membershipService
          .getCommunityMemberships(context.community.id)
          .map((membership) =>
            identityService.getUser(membership.userId)
          )
          .filter((user): user is NonNullable<typeof user> => Boolean(user))
          .find((user) =>
            identityService
              .getUserIdentities(user.id)
              .some(
                (identity) =>
                  identity.platform === context.platform &&
                  identity.username?.toLowerCase() ===
                    normalizedTarget
              )
          );
      }

      if (!target && memberDirectory) {
        const username = targetArg.replace(/^@/, "").trim();
        const native =
          targetArg.startsWith("@")
            ? await memberDirectory.findMemberByUsername?.(
                context.community.id,
                username
              )
            : await memberDirectory.getMember(
                context.community.id,
                targetArg
              );

        if (native) {
          target = identityService.findUserByIdentity(
            native.user.platform,
            native.user.externalId
          );

          if (!target) {
            target = identityService.createUser({
              displayName:
                native.user.displayName ??
                native.user.username ??
                native.user.externalId
            });

            identityService.attachIdentity({
              userId: target.id,
              platform: native.user.platform,
              externalId: native.user.externalId,
              username: native.user.username,
              displayName: native.user.displayName,
              avatarUrl: native.user.avatarUrl
            });
          }
        }
      }

      if (!target) return { content: `Участник ${targetArg} не найден.` };

      const membership = membershipService.findMembership(target.id, context.community.id);
      if (!membership) return { content: "Участник не состоит в этом сообществе." };

      const roles = accessControlService.getUserCommunityRoles(target.id, context.community.id);

      if (!requestedRole) {
        const nativeIdentity = identityService
          .getUserIdentities(target.id)
          .find((identity) => identity.platform === context.platform);
        const native = nativeIdentity && memberDirectory
          ? await memberDirectory.getMember(
              context.community.id,
              nativeIdentity.externalId
            )
          : undefined;
        const platformRoles = native?.roles ?? [];

        return {
          content: [
            `👤 ${target.displayName}`,
            `Роли Modexa: ${roles.map(role => role.name).join(", ") || "MEMBER"}`,
            `Роли платформы: ${platformRoles.length > 0
              ? platformRoles
                  .map((role) =>
                    context.platform === "discord"
                      ? "@" + role.replace(/^@/, "")
                      : role
                  )
                  .join(", ")
              : "нет"}`
          ].join("\n")
        };
      }

      if (!["MEMBER", "MODERATOR"].includes(requestedRole)) {
        return { content: "Доступные роли: member, moderator." };
      }

      if (!context.execution.capabilities.includes("member.manage")) {
        return { content: "Недостаточно прав: требуется member.manage." };
      }

      const targetRole = createBuiltinCommunityRoles(context.community.id)
        .find(role => role.name === requestedRole);

      if (!targetRole) return { content: "Роль не найдена." };

      // Ensure the built-in role definition exists in persistent storage
      // before assigning it to the user.
      accessControlService.registerCommunityRole(targetRole);

      for (const role of roles) {
        if (role.id !== targetRole.id) {
          accessControlService.revokeCommunityRole(target.id, role.id);
        }
      }

      const alreadyAssigned =
        roles.length === 1 && roles[0]?.id === targetRole.id;

      if (alreadyAssigned) {
        return {
          content: `ℹ️ ${target.displayName}: роль **${targetRole.name}** уже назначена.`
        };
      }

      accessControlService.assignCommunityRole(target.id, targetRole.id);

      return {
        content: `✅ ${target.displayName}: роль изменена на **${targetRole.name}**.`
      };
    }
  };
}
