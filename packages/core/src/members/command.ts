import type { CommandDefinition, CommandResponse } from "../types.js";
import type { AccessControlService } from "../access/service.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import { createTranslator } from "../i18n/translate.js";

export function createMemberCommand(
  identityService: IdentityService,
  membershipService: MembershipService,
  accessControlService: AccessControlService
): CommandDefinition {
  return {
    name: "member",
    descriptionKey: "command.member.description",
    requiredCapabilities: ["member.view"],
    handler: (context): CommandResponse => {
      const t = createTranslator(context.execution.locale);

      if (context.execution.type !== "community" || !context.community) {
        return { content: t("member.community_only") };
      }

      const target = context.args[0]?.replace(/^@/, "").trim();
      const user = target
        ? identityService.findUserByUsername(target, context.execution.platform)
        : context.user;

      if (!user) {
        return { content: t("member.not_found", { username: target ?? "" }) };
      }

      const membership = membershipService.findMembership(user.id, context.community.id);
      const roles = accessControlService
        .getUserCommunityRoles(user.id, context.community.id)
        .map((role) => role.name);
      const identity = identityService
        .getUserIdentities(user.id)
        .find((item) => item.platform === context.execution.platform);
      const joinedText = membership?.joinedAt
        ? membership.joinedAt.toLocaleString(context.execution.locale === "en" ? "en-US" : "ru-RU")
        : "—";

      return {
        content: [
          t("member.title"),
          t("member.name", { name: user.displayName }),
          t("member.id", { id: user.id }),
          t("member.username", { username: identity?.username ? `@${identity.username}` : "—" }),
          t("member.platform", { platform: context.execution.platform }),
          t("member.roles", { roles: roles.length > 0 ? roles.join(", ") : t("member.no_roles") }),
          t("member.joined", { date: joinedText })
        ].join("\n")
      };
    }
  };
}
