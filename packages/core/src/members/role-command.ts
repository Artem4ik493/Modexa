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

      let target =
        identityService.findUserByIdentity(context.platform, targetArg) ??
        identityService.findUserByUsername(targetArg.replace(/^@/, ""), context.platform);

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
        return {
          content: [
            `👤 ${target.displayName}`,
            `Роли: ${roles.map(role => role.name).join(", ") || "MEMBER"}`
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

      accessControlService.assignCommunityRole(target.id, targetRole.id);

      return {
        content: `✅ ${target.displayName}: роль изменена на **${targetRole.name}**.`
      };
    }
  };
}
