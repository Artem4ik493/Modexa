import type { CommandContext, CommandDefinition } from "../types.js";
import type { CommandRegistry } from "../commands.js";
import type { IdentityService } from "../identity/service.js";
import type { MembershipService } from "../memberships/service.js";
import type { CommunityService } from "../communities/service.js";
import type { ModerationService } from "../moderation/service.js";
import type { AdapterAction } from "../adapters/actions.js";
import { CardImageService } from "../images/cards.js";
import { CommandSettingsService } from "./settings.js";

function panel(
  title: string,
  description: string,
  color = 0x8b5cf6,
  fields?: Array<{ name: string; value: string; inline?: boolean }>,
  buttons?: Array<{
    id: string;
    label: string;
    action:
      | { type: "command"; command: string; args?: string[] }
      | { type: "callback"; data: string };
  }>
) {
  return {
    embed: {
      title,
      description,
      color,
      fields,
      footer: "Modexa • Community OS"
    },
    buttons
  };
}

function resolveTarget(
  context: CommandContext,
  identities: IdentityService,
  memberships: MembershipService
) {
  if (!context.args[0]) return context.user;
  const name = context.args[0].replace(/^@/, "").toLowerCase();
  const direct = identities.findUserByUsername(name, context.platform);
  if (direct) return direct;
  if (!context.community) return undefined;
  return memberships
    .getCommunityMemberships(context.community.id)
    .map((m) => identities.getUser(m.userId))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .find((u) =>
      identities.getUserIdentities(u.id).some(
        (i) =>
          i.platform === context.platform &&
          i.username?.toLowerCase() === name
      )
    );
}

export function createPublicFeatureCommands(
  registry: CommandRegistry,
  identities: IdentityService,
  memberships: MembershipService,
  communities: CommunityService,
  settings: CommandSettingsService,
  moderation: ModerationService,
  executeAction?: (action: AdapterAction) => Promise<void>,
  cards = new CardImageService()
): CommandDefinition[] {
  return [
    {
      name: "clear",
      aliases: ["purge", "очистить"],
      description: "Удалить указанное количество сообщений",
      requiredCapabilities: ["moderation"],
      handler: async (context) => {
        if (!context.channel?.externalId || !executeAction) {
          return panel("Очистка сообщений", "❌ Очистка недоступна в этом канале.", 0xff5d73);
        }
        const count = Number.parseInt(context.args[0] ?? "", 10);
        if (!Number.isInteger(count) || count < 1 || count > 100) {
          return panel("Очистка сообщений", "Использование: /clear <1-100>", 0xffb454);
        }
        await executeAction({
          type: "channel.clear",
          platform: context.platform,
          channelExternalId: context.channel.externalId,
          count
        });
        return panel(
          "Сообщения очищены",
          `Удалено сообщений: **${count}**`,
          0x39d98a
        );
      }
    },
    {
      name: "help",
      aliases: ["commands", "хелп"],
      description: "Список доступных команд",
      handler: async (context) => {
        const list = registry
          .listAvailable(context.execution.capabilities)
          .filter((c) => c.name !== "help")
          .filter(
            (c) =>
              !context.community ||
              settings.isEnabled(context.community.id, c.name)
          );
        return panel(
          "Команды Modexa",
          list.length
            ? list
                .map(
                  (c) =>
                    `**/${c.name}** — ${c.description ?? "без описания"}`
                )
                .join("\n")
            : "Нет доступных команд.",
          0x5b8cff,
          [{ name: "Доступно", value: String(list.length), inline: true }],
          [
            {
              id: "help-settings",
              label: "Настройки",
              action: { type: "command", command: "settings" }
            }
          ]
        );
      }
    },
    {
      name: "command",
      aliases: ["cmd"],
      description: "Включить или выключить команду",
      requiredCapabilities: ["community.manage"],
      handler: async (context) => {
        if (!context.community) {
          return panel("Настройки команды", "Команда доступна только в сообществе.", 0xffb454);
        }
        const name = context.args[0]?.replace(/^\//, "").toLowerCase();
        const value = context.args[1]?.toLowerCase();
        if (!name || !["on", "off", "enable", "disable"].includes(value ?? "")) {
          return panel("Настройки команды", "Использование: /command <команда> <on|off>", 0xffb454);
        }
        const enabled = value === "on" || value === "enable";
        settings.setEnabled(context.community.id, name, enabled);
        return panel(
          enabled ? "Команда включена" : "Команда отключена",
          `/${name} ${enabled ? "снова доступна участникам." : "заблокирована в этом сообществе."}`,
          enabled ? 0x39d98a : 0xff5d73
        );
      }
    },
    {
      name: "info",
      aliases: ["botinfo"],
      description: "Информация о Modexa",
      handler: async () =>
        panel(
          "Modexa",
          "Единая система автоматизации Telegram + Discord.",
          0x8b5cf6,
          [
            { name: "Модерация", value: "Warn · Mute · Kick · Ban", inline: true },
            { name: "Комьюнити", value: "Roles · Members · Permissions", inline: true },
            { name: "Автоматизация", value: "AutoMod · Bridge · Automations", inline: true }
          ]
        )
    },
    {
      name: "server",
      aliases: ["community"],
      description: "Информация о сообществе",
      handler: async (context) => {
        if (!context.community) {
          return panel("Сообщество", "Эта команда работает только в сообществе.", 0xffb454);
        }
        const members = memberships
          .getCommunityMemberships(context.community.id)
          .filter((m) => m.status === "active").length;
        const identity = communities
          .getCommunityIdentities(context.community.id)
          .find((i) => i.platform === context.platform);
        return panel(
          "🏠 " + context.community.name,
          "Сводка сообщества и подключённой платформы.",
          0x5b8cff,
          [
            { name: "Платформа", value: context.platform, inline: true },
            { name: "Участников", value: String(members), inline: true },
            { name: "Community ID", value: context.community.id },
            ...(identity
              ? [{ name: "External ID", value: identity.externalId }]
              : [])
          ]
        );
      }
    },
    {
      name: "user",
      aliases: ["profile", "юзер"],
      description: "Информация об участнике",
      handler: async (context) => {
        const user = resolveTarget(context, identities, memberships);
        if (!user) {
          return panel("Профиль", "Участник не найден.", 0xff5d73);
        }
        const accounts = identities
          .getUserIdentities(user.id)
          .map(
            (i) =>
              i.platform +
              ": " +
              (i.username ? "@" + i.username : i.externalId)
          )
          .join(", ");
        return {
          ...panel(
            "👤 " + user.displayName,
            "Профиль пользователя Modexa.",
            0x8b5cf6,
            [
              { name: "Modexa ID", value: user.id },
              { name: "Аккаунты", value: accounts || "нет" }
            ]
          ),
          imageUrl: cards.profile({
            displayName: user.displayName,
            userId: user.id,
            accounts: accounts || "нет"
          })
        };
      }
    },
    {
      name: "stats",
      aliases: ["stat"],
      description: "Статистика использования",
      handler: async (context) => {
        if (!context.community) {
          return panel("Статистика", "Команда доступна внутри сообщества.", 0xffb454);
        }
        const members = memberships.getCommunityMemberships(context.community.id);
        const cases = moderation.getCases(context.community.id);
        const activeMembers = members.filter((m) => m.status === "active").length;
        const activeCases = cases.filter((c) => c.status === "active").length;
        return {
          ...panel(
            "📊 Статистика",
            "Текущее состояние сообщества.",
            0x39d98a,
            [
              { name: "Участники", value: String(activeMembers), inline: true },
              { name: "Активные кейсы", value: String(activeCases), inline: true },
              { name: "Всего кейсов", value: String(cases.length), inline: true }
            ]
          ),
          imageUrl: cards.stats({
            communityName: context.community.name,
            members: activeMembers,
            activeCases,
            totalCases: cases.length
          })
        };
      }
    },
    {
      name: "warnings",
      aliases: ["warns", "преды"],
      description: "Список активных предупреждений",
      handler: async (context) => {
        if (!context.community) {
          return panel("Предупреждения", "Команда доступна только в сообществе.", 0xffb454);
        }
        const cases = moderation
          .getCases(context.community.id)
          .filter((c) => c.action === "warn" && c.status === "active");
        if (!cases.length) {
          return panel("⚠️ Предупреждения", "Активных предупреждений нет.", 0x39d98a);
        }
        return panel(
          "⚠️ Активные предупреждения",
          cases
            .slice(0, 20)
            .map(
              (c) =>
                `• **${identities.getUser(c.targetUserId)?.displayName ?? c.targetUserId}** — ${c.reason ?? "без причины"}`
            )
            .join("\n"),
          0xffb454,
          [{ name: "Активных", value: String(cases.length), inline: true }]
        );
      }
    },
    {
      name: "mutes",
      aliases: ["mute-list"],
      description: "Список активных мутов",
      handler: async (context) => {
        if (!context.community) {
          return panel("Муты", "Команда доступна только в сообществе.", 0xffb454);
        }
        const cases = moderation
          .getCases(context.community.id)
          .filter((c) => c.action === "mute" && c.status === "active");
        if (!cases.length) {
          return panel("🔇 Муты", "Активных мутов нет.", 0x39d98a);
        }
        return panel(
          "🔇 Активные муты",
          cases
            .slice(0, 20)
            .map(
              (c) =>
                `• **${identities.getUser(c.targetUserId)?.displayName ?? c.targetUserId}** — ${c.durationSeconds ?? "?"} сек.`
            )
            .join("\n"),
          0xffb454,
          [{ name: "Активных", value: String(cases.length), inline: true }]
        );
      }
    },
    {
      name: "settings",
      aliases: ["config"],
      description: "Настройки команд",
      requiredCapabilities: ["community.manage"],
      handler: async (context) => {
        if (!context.community) {
          return panel("Настройки", "Команда доступна только в сообществе.", 0xffb454);
        }
        const configured = new Map(
          settings.list(context.community.id).map((x) => [x.commandName, x.enabled])
        );
        const commands = registry.list();
        return panel(
          "⚙️ Настройки команд",
          commands
            .map(
              (c) =>
                `**/${c.name}** — ${configured.get(c.name) === false ? "⛔ отключена" : "✅ включена"}`
            )
            .join("\n"),
          0x5b8cff,
          [{ name: "Команд", value: String(commands.length), inline: true }],
          commands.slice(0, 20).map((c) => ({
            id: "toggle-" + c.name,
            label:
              (configured.get(c.name) === false ? "Вкл " : "Выкл ") +
              "/" +
              c.name,
            action: {
              type: "command" as const,
              command: "command",
              args: [
                c.name,
                configured.get(c.name) === false ? "on" : "off"
              ]
            }
          }))
        );
      }
    }
  ];
}
