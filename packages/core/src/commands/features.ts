import type { CommandContext, CommandDefinition } from "../types.js";
import type { CommandRegistry } from "../commands.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import type { CommunityService } from "../communities/service.js";
import type { ModerationService } from "../moderation/service.js";
import type { AdapterAction } from "../adapters/actions.js";
import { CommandSettingsService } from "./settings.js";

function resolveTarget(context: CommandContext, identities: IdentityService, memberships: MembershipService) {
  if (!context.args[0]) return context.user;
  const name = context.args[0].replace(/^@/, "").toLowerCase();
  const direct = identities.findUserByUsername(name, context.platform);
  if (direct) return direct;
  if (!context.community) return undefined;
  return memberships.getCommunityMemberships(context.community.id)
    .map((m) => identities.getUser(m.userId))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .find((u) => identities.getUserIdentities(u.id).some((i) => i.platform === context.platform && i.username?.toLowerCase() === name));
}

export function createPublicFeatureCommands(
  registry: CommandRegistry,
  identities: IdentityService,
  memberships: MembershipService,
  communities: CommunityService,
  settings: CommandSettingsService,
  moderation: ModerationService,
  executeAction?: (action: AdapterAction) => Promise<void>
): CommandDefinition[] {
  return [
    {
      name: "clear", aliases: ["purge", "очистить"], description: "Удалить указанное количество сообщений", requiredCapabilities: ["moderation"],
      handler: async (context) => {
        if (!context.channel?.externalId || !executeAction) return { content: "❌ Очистка сообщений недоступна в этом канале." };
        const count = Number.parseInt(context.args[0] ?? "", 10);
        if (!Number.isInteger(count) || count < 1 || count > 100) return { content: "Использование: /clear <1-100>" };
        await executeAction({
          type: "channel.clear",
          platform: context.platform,
          channelExternalId: context.channel.externalId,
          count
        });
        return { content: "✅ Очищено " + count + " сообщений!" };
      }
    },
    {
      name: "help", aliases: ["commands", "хелп"], description: "Список доступных команд",
      handler: async (context) => {
        const list = registry.listAvailable(context.execution.capabilities)
          .filter((c) => c.name !== "help")
          .filter((c) => !context.community || settings.isEnabled(context.community.id, c.name));
        return { content: ["📚 Команды Modexa", "", ...list.map((c) => "/" + c.name + " — " + (c.description ?? "без описания"))].join("\n") };
      }
    },
    {
      name: "command", aliases: ["cmd"], description: "Включить или выключить команду", requiredCapabilities: ["community.manage"],
      handler: async (context) => {
        if (!context.community) return { content: "Команда доступна только в сообществе." };
        const name = context.args[0]?.replace(/^\//, "").toLowerCase();
        const value = context.args[1]?.toLowerCase();
        if (!name || !["on", "off", "enable", "disable"].includes(value ?? "")) return { content: "Использование: /command <команда> <on|off>" };
        const enabled = value === "on" || value === "enable";
        settings.setEnabled(context.community.id, name, enabled);
        return { content: (enabled ? "✅ " : "⛔ ") + "Команда /" + name + (enabled ? " включена." : " выключена.") };
      }
    },
    { name: "info", aliases: ["botinfo"], description: "Информация о Modexa", handler: async () => ({ content: "🤖 Modexa\nЕдиная система автоматизации Telegram + Discord.\nМодерация, роли, bridge и автоматизации." }) },
    {
      name: "server", aliases: ["community"], description: "Информация о сообществе",
      handler: async (context) => {
        if (!context.community) return { content: "Эта команда работает только в сообществе." };
        const members = memberships.getCommunityMemberships(context.community.id).filter((m) => m.status === "active").length;
        const identity = communities.getCommunityIdentities(context.community.id).find((i) => i.platform === context.platform);
        return { content: ["🏠 " + context.community.name, "ID: " + context.community.id, "Платформа: " + context.platform, "Участников: " + members, identity ? "External ID: " + identity.externalId : ""].filter(Boolean).join("\n") };
      }
    },
    {
      name: "user", aliases: ["profile", "юзер"], description: "Информация об участнике",
      handler: async (context) => {
        const user = resolveTarget(context, identities, memberships);
        if (!user) return { content: "Участник не найден." };
        const accounts = identities.getUserIdentities(user.id).map((i) => i.platform + ": " + (i.username ? "@" + i.username : i.externalId)).join(", ");
        return { content: ["👤 " + user.displayName, "ID: " + user.id, "Аккаунты: " + (accounts || "нет")].join("\n") };
      }
    },
    {
      name: "stats", aliases: ["stat"], description: "Статистика использования",
      handler: async (context) => {
        if (!context.community) return { content: "📊 Статистика доступна внутри сообщества." };
        const members = memberships.getCommunityMemberships(context.community.id);
        const cases = moderation.getCases(context.community.id);
        return { content: ["📊 Статистика", "Участников: " + members.filter((m) => m.status === "active").length, "Активных кейсов: " + cases.filter((c) => c.status === "active").length, "Всего кейсов: " + cases.length].join("\n") };
      }
    },
    {
      name: "warnings", aliases: ["warns", "преды"], description: "Список активных предупреждений",
      handler: async (context) => {
        if (!context.community) return { content: "Команда доступна только в сообществе." };
        const cases = moderation.getCases(context.community.id).filter((c) => c.action === "warn" && c.status === "active");
        if (!cases.length) return { content: "⚠️ Активных предупреждений нет." };
        return { content: ["⚠️ Активные предупреждения", ...cases.slice(0, 20).map((c) => "• " + (identities.getUser(c.targetUserId)?.displayName ?? c.targetUserId) + ": " + (c.reason ?? "без причины") + " [" + c.id + "]")].join("\n") };
      }
    },
    {
      name: "mutes", aliases: ["mute-list"], description: "Список активных мутов",
      handler: async (context) => {
        if (!context.community) return { content: "Команда доступна только в сообществе." };
        const cases = moderation.getCases(context.community.id).filter((c) => c.action === "mute" && c.status === "active");
        if (!cases.length) return { content: "🔇 Активных мутов нет." };
        return { content: ["🔇 Активные муты", ...cases.slice(0, 20).map((c) => "• " + (identities.getUser(c.targetUserId)?.displayName ?? c.targetUserId) + ": " + (c.durationSeconds ?? "?") + " сек. [" + c.id + "]")].join("\n") };
      }
    },
    {
      name: "settings", aliases: ["config"], description: "Настройки команд", requiredCapabilities: ["community.manage"],
      handler: async (context) => {
        if (!context.community) return { content: "Команда доступна только в сообществе." };
        const configured = new Map(settings.list(context.community.id).map((x) => [x.commandName, x.enabled]));
        return { content: ["⚙️ Настройки команд", ...registry.list().map((c) => "/" + c.name + " — " + (configured.get(c.name) === false ? "⛔" : "✅"))].join("\n") };
      }
    }
  ];
}