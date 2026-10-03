import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "../types.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import type { CommunityService } from "../communities/service.js";
import type { MemberDirectory } from "../members/command.js";
import type { AdapterAction } from "../adapters/actions.js";
import type { ExecutionCapability } from "../contexts/types.js";
import { ModerationService } from "./service.js";
import type { ModerationActionType } from "./types.js";

export type ModerationActionExecutor = (
  action: AdapterAction
) => Promise<void>;

const MODERATION_CAPABILITIES: ExecutionCapability[] = ["moderation"];

const ACTIONS: ModerationActionType[] = [
  "warn",
  "mute",
  "kick",
  "ban"
];

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60
};

function parseDuration(
  value: string | undefined
): number | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds > 0
      ? seconds
      : undefined;
  }

  const match = /^(\d+)([smhd])$/i.exec(value);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = DURATION_UNITS[match[2]!.toLowerCase()];

  if (!Number.isSafeInteger(amount) || amount <= 0 || !unit) {
    return undefined;
  }

  const seconds = amount * unit;

  return Number.isSafeInteger(seconds) && seconds > 0
    ? seconds
    : undefined;
}

function actionLabel(
  action: ModerationActionType
): string {
  switch (action) {
    case "warn":
      return "предупреждение";
    case "mute":
      return "мут";
    case "kick":
      return "кик";
    case "ban":
      return "бан";
  }
}

function usage(
  action: ModerationActionType
): string {
  if (action === "mute") {
    return "/mute @user 10m [причина]";
  }

  return `/${action} @user [причина]`;
}

export function createModerationCommands(
  identityService: IdentityService,
  membershipService: MembershipService,
  communityService: CommunityService,
  moderationService: ModerationService,
  memberDirectory?: MemberDirectory,
  executeAction?: ModerationActionExecutor
): CommandDefinition[] {
  return ACTIONS.map((action) => ({
    name: action,
    description: `Moderation: ${action}`,
    requiredCapabilities: MODERATION_CAPABILITIES,
    handler: async (
      context: CommandContext
    ): Promise<CommandResponse> => {
      if (!context.community) {
        return {
          content: `Команду /${action} можно использовать только в сообществе.`
        };
      }

      if (!executeAction) {
        return {
          content: "Модерация платформы ещё не настроена."
        };
      }

      const targetArg = context.args[0];

      if (!targetArg) {
        return {
          content: `Использование: ${usage(action)}`
        };
      }

      let durationSeconds: number | undefined;

      if (action === "mute") {
        durationSeconds = parseDuration(context.args[1]);

        if (durationSeconds === undefined) {
          return {
            content:
              "Укажите длительность: 30s, 10m, 2h, 1d или количество секунд."
          };
        }
      }

      const durationOffset =
        action === "mute" ? 2 : 1;

      const reason =
        context.args
          .slice(durationOffset)
          .join(" ")
          .trim() || undefined;

      const normalizedTarget =
        targetArg
          .replace(/^@/, "")
          .trim()
          .toLowerCase();

      let target =
        identityService.findUserByIdentity(
          context.platform,
          targetArg
        ) ??
        identityService.findUserByUsername(
          normalizedTarget,
          context.platform
        );

      if (!target) {
        target = membershipService
          .getCommunityMemberships(
            context.community.id
          )
          .map((membership) =>
            identityService.getUser(membership.userId)
          )
          .filter(
            (user): user is NonNullable<typeof user> =>
              Boolean(user)
          )
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
        const native =
          targetArg.startsWith("@")
            ? await memberDirectory.findMemberByUsername?.(
                context.community.id,
                targetArg.replace(/^@/, "").trim()
              )
            : await memberDirectory.getMember(
                context.community.id,
                targetArg
              );

        if (native) {
          target =
            identityService.findUserByIdentity(
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

      if (!target) {
        return {
          content: `Участник ${targetArg} не найден.`
        };
      }

      const membership =
        membershipService.findMembership(
          target.id,
          context.community.id
        );

      if (!membership || membership.status !== "active") {
        return {
          content: "Участник не состоит в этом сообществе."
        };
      }

      const targetIdentity =
        identityService
          .getUserIdentities(target.id)
          .find(
            (identity) =>
              identity.platform === context.platform
          );

      if (!targetIdentity) {
        return {
          content:
            "Не найден аккаунт участника на текущей платформе."
        };
      }

      const communityIdentity =
        communityService
          .getCommunityIdentities(context.community.id)
          .find(
            (identity) =>
              identity.platform === context.platform
          );

      if (!communityIdentity) {
        return {
          content:
            "Не найден внешний идентификатор сообщества."
        };
      }

      const created =
        moderationService.createCase({
          action,
          actorUserId:
            context.user.id,
          targetUserId:
            target.id,
          communityId:
            context.community.id,
          platform:
            context.platform,
          communityExternalId:
            communityIdentity.externalId,
          userExternalId:
            targetIdentity.externalId,
          ...(durationSeconds !== undefined
            ? { durationSeconds }
            : {}),
          ...(reason
            ? { reason }
            : {})
        });

      const actionWithMetadata: AdapterAction = {
        ...created.adapterAction,
        metadata: {
          targetDisplayName:
            target.displayName,
          moderationCaseId:
            created.case.id
        }
      };

      try {
        await executeAction(actionWithMetadata);
      } catch (error) {
        return {
          content:
            `❌ Не удалось применить ${actionLabel(action)}: ${error instanceof Error ? error.message : "неизвестная ошибка"}`
        };
      }

      const details =
        action === "mute" && durationSeconds !== undefined
          ? ` на ${formatDuration(durationSeconds)}`
          : "";

      return {
        content: [
          `✅ ${actionLabel(action)[0]!.toUpperCase() + actionLabel(action).slice(1)} применён к ${target.displayName}${details}.`,
          ...(reason ? [`Причина: ${reason}`] : []),
          `Case: ${created.case.id}`
        ].join("\n")
      };
    }
  }));
}

function formatDuration(
  seconds: number
): string {
  const units: Array<[string, number]> = [
    ["д", 24 * 60 * 60],
    ["ч", 60 * 60],
    ["м", 60],
    ["с", 1]
  ];

  let remaining = seconds;
  const parts: string[] = [];

  for (const [label, size] of units) {
    if (remaining < size) {
      continue;
    }

    const count = Math.floor(remaining / size);
    remaining %= size;
    parts.push(`${count}${label}`);
  }

  return parts.join(" ");
}
