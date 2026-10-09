import type { CommandDefinition } from "../types.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import type { CommunityService } from "../communities/service.js";
import type { AdapterAction } from "../adapters/actions.js";
import type { MemberDirectory } from "../members/command.js";
import type { ModerationService } from "./service.js";

export function createModerationRestoreCommands(
  identities: IdentityService,
  memberships: MembershipService,
  communities: CommunityService,
  moderation: ModerationService,
  executeAction: (action: AdapterAction) => Promise<void>,
  memberDirectory?: MemberDirectory
): CommandDefinition[] {
  return ["unmute", "unban"].map((name) => ({
    name, description: name === "unmute" ? "Снять мут с участника" : "Разбанить участника", requiredPermissions: [name === "unmute" ? "moderation.mute" : "moderation.ban"],
    handler: async (context) => {
      if (!context.community) return { content: "Команда доступна только в сообществе." };
      const rawArg = context.args[0]?.trim();
      const arg = rawArg
        ?.replace(/^<@!?/, "")
        .replace(/>$/, "")
        .replace(/^@/, "")
        .toLowerCase();
      if (!arg) return { content: "Использование: /" + name + " @user" };
      let target = identities.findUserByIdentity(context.platform, context.args[0]!) ??
        identities.findUserByUsername(arg, context.platform) ??
        identities.getUser(arg) ??
        memberships.getCommunityMemberships(context.community.id)
          .map((m) => identities.getUser(m.userId))
          .filter((u): u is NonNullable<typeof u> => Boolean(u))
          .find((u) => identities.getUserIdentities(u.id).some(
            (i) => i.platform === context.platform && i.username?.toLowerCase() === arg
          ));

      if (!target && memberDirectory) {
        const native = /^\d+$/.test(arg)
          ? await memberDirectory.getMember(context.community.id, arg)
          : await memberDirectory.findMemberByUsername?.(context.community.id, arg);
        if (native) {
          target = identities.findUserByIdentity(
            native.user.platform,
            native.user.externalId
          );
          if (!target) {
            target = identities.createUser({
              displayName:
                native.user.displayName ??
                native.user.username ??
                native.user.externalId
            });
            identities.attachIdentity({
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

      if (!target) return { content: "Участник не найден." };
      let membership = memberships.findMembership(target.id, context.community.id);
      if (!membership && memberDirectory) {
        const identity = identities.getUserIdentities(target.id)
          .find((item) => item.platform === context.platform);
        const native = identity
          ? await memberDirectory.getMember(context.community.id, identity.externalId)
          : undefined;
        if (native && native.isMember !== false) {
          membership = memberships.createMembership({
            userId: target.id,
            communityId: context.community.id,
            now: native.joinedAt
          });
        }
      }
      if (!membership || membership.status !== "active") return { content: "Участник не состоит в этом сообществе." };
      const actionType = name === "unmute" ? "mute" : "ban";
      const item = moderation.getCases(context.community.id).find((c) => c.action === actionType && c.status === "active" && c.targetUserId === target.id);
      if (!item) return { content: "Активный кейс для этого действия не найден." };
      const identity = identities.getUserIdentities(target.id).find((i) => i.platform === context.platform);
      const community = communities.getCommunityIdentities(context.community.id).find((i) => i.platform === context.platform);
      if (!identity || !community) return { content: "Не найден внешний аккаунт участника." };
      const action: AdapterAction = name === "unmute"
        ? { type: "member.unmute", platform: context.platform, communityExternalId: community.externalId, userExternalId: identity.externalId }
        : { type: "member.unban", platform: context.platform, communityExternalId: community.externalId, userExternalId: identity.externalId };
      try {
        await executeAction(action);
      } catch (error) {
        return { content: "❌ Не удалось выполнить действие: " + (error instanceof Error ? error.message : "ошибка") };
      }

      moderation.revokeCase(context.user.id, item.id);
      return { content: "✅ " + (name === "unmute" ? "Мут снят." : "Участник разбанен.") };
    }
  }));
}