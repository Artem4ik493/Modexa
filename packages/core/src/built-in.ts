import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "./types.js";

import type { CommandRegistry } from "./commands.js";

import type { CommunityService } from "./communities/service.js";

import type { IdentityService } from "./identity/service.js";
import type { MembershipService } from "./memberships/service.js";
import type { AccessControlService } from "./access/service.js";
import type { ModexaDatabase } from "./database/service.js";

import type { BridgeService } from "./bridge/service.js";

import type {
  InteractionHandlerContext
} from "./interactions/dispatcher.js";

import type {
  InteractionResponse
} from "./interactions/types.js";

import type {
  InteractionButton
} from "./interactions/types.js";

import {
  createTranslator,
  type Translator
} from "./i18n/translate.js";

function platformLabel(
  platform: "telegram" | "discord"
): string {
  return platform === "telegram"
    ? "Telegram"
    : "Discord";
}

function createMenuResponse(
  t: Translator,
  canManageSystem: boolean
): CommandResponse {
  return {
    content: t("menu.title"),
    buttons: [
      {
        id: "account",
        label: t("menu.account"),
        action: {
          type: "command",
          command: "/account"
        }
      },
      {
        id: "settings",
        label: t("menu.settings"),
        action: {
          type: "command",
          command: "/settings"
        }
      },
      ...(canManageSystem
        ? [{
            id: "system",
            label: t("menu.system"),
            action: {
              type: "command" as const,
              command: "/system"
            }
          }]
        : []),
      createCloseButton(t)
    ]
  };
}

function createCloseButton(
  t: Translator
): InteractionButton {
  return {
    id: "close",
    label: t("menu.close"),
    action: {
      type: "callback",
      data: "menu.close"
    }
  };
}

function createBackButton(
  t: Translator
): InteractionButton {
  return {
    id: "back",
    label: t("menu.back"),
    action: {
      type: "command",
      command: "/menu"
    }
  };
}

function handleSystem(
  context: CommandContext,
  database?: ModexaDatabase
): CommandResponse {
  const t =
    createTranslator(
      context.execution.locale
    );

  if (
    !context.execution.capabilities.includes(
      "system.manage"
    )
  ) {
    return {
      content:
        t("system.forbidden")
    };
  }

  const action =
    context.args[0]?.toLowerCase();

  if (action === "maintenance") {
    const current =
      database?.getSystemSetting(
        "maintenance_mode"
      ) === "true";

    const next =
      context.args[1]?.toLowerCase() === "on"
        ? true
        : context.args[1]?.toLowerCase() === "off"
          ? false
          : !current;

    database?.setSystemSetting(
      "maintenance_mode",
      String(next)
    );

    return {
      content: [
        t("system.settings.title"),
        t(
          next
            ? "system.maintenance.on"
            : "system.maintenance.off"
        )
      ].join("\n"),
      buttons: [
        createBackButton(t),
        createCloseButton(t)
      ]
    };
  }

  if (action === "settings") {
    const maintenance =
      database?.getSystemSetting(
        "maintenance_mode"
      ) === "true";

    return {
      content: [
        t("system.settings.title"),
        t(
          maintenance
            ? "system.maintenance.on"
            : "system.maintenance.off"
        )
      ].join("\n"),
      buttons: [
        {
          id: "system-maintenance",
          label: t("system.maintenance.toggle"),
          action: {
            type: "command",
            command: "/system",
            args: ["maintenance"]
          }
        },
        createBackButton(t),
        createCloseButton(t)
      ]
    };
  }

  return {
    content: [
      t("system.title"),
      t("system.name"),
      t("system.version"),
      t("system.platform", {
        platform:
          context.execution.platform
      }),
      t("system.role", {
        role: "MODEXA_OWNER"
      }),
      t("system.persistence")
    ].join("\n"),
    buttons: [
      {
        id: "system-settings",
        label: t("system.settings.button"),
        action: {
          type: "command",
          command: "/system",
          args: ["settings"]
        }
      },
      createBackButton(t),
      createCloseButton(t)
    ]
  };
}

function handleAccount(
  context: CommandContext,
  identityService?: IdentityService
): CommandResponse {
  const { execution } = context;
  const t = createTranslator(execution.locale);

  if (!execution.capabilities.includes("account.manage")) {
    return { content: t("account.dm_only") };
  }

  const identities =
    identityService?.getUserIdentities(execution.user.id) ?? [];

  const identity = identities.find(
    (item) => item.platform === execution.platform
  );

  const linkedIdentity = identities.find(
    (item) => item.platform !== execution.platform
  );

  const username = identity?.username
    ? `@${identity.username}`
    : "—";

  const platformId =
    identity?.externalId ?? execution.user.id;

  return {
    content: [
      t("account.title"),
      t("account.name", { name: execution.user.displayName }),
      t("account.username", { username }),
      t("account.platform", {
        platform: platformLabel(execution.platform)
      }),
      t("account.platform_id", { id: platformId }),
      t("account.status", {
        status: t(
          linkedIdentity
            ? "account.status.linked"
            : "account.status.unlinked"
        )
      }),
      ...(linkedIdentity
        ? [
            t("account.linked_account", {
              platform: platformLabel(linkedIdentity.platform),
              username: linkedIdentity.username
                ? `@${linkedIdentity.username}`
                : linkedIdentity.externalId
            })
          ]
        : []),
      t("account.context", {
        context: t(
          execution.type === "dm"
            ? "context.dm"
            : "context.community"
        )
      })
    ].join("\n"),
    buttons: [
      linkedIdentity
        ? {
            id: "account-unlink",
            label: t("account.unlink"),
            action: {
              type: "callback" as const,
              data: `account.unlink:${linkedIdentity.id}`
            }
          }
        : {
            id: "account-link",
            label: t("account.link"),
            action: {
              type: "command" as const,
              command: "/link"
            }
          },
      createBackButton(t),
      createCloseButton(t)
    ]
  };
}

export function createAccountInteractionHandler(
  identityService: IdentityService
): (
  context: InteractionHandlerContext
) => Promise<InteractionResponse> {
  return async (context) => {
    const data =
      context.action.type === "callback"
        ? context.action.data
        : "";

    const t = createTranslator(context.execution.locale);

    if (!data.startsWith("account.unlink:")) {
      return {
        content: t("interaction.unhandled")
      };
    }

    if (context.execution.type !== "dm") {
      return {
        content: t("account.dm_only")
      };
    }

    if (!context.execution.capabilities.includes("account.manage")) {
      return {
        content: t("account.unlink_forbidden")
      };
    }

    const identityId = data.slice("account.unlink:".length);
    const identity = identityService
      .getUserIdentities(context.execution.user.id)
      .find((item) => item.id === identityId);

    if (!identity || identity.platform === context.execution.platform) {
      return {
        content: t("account.unlink_unavailable")
      };
    }

    try {
      identityService.detachIdentity(identity.id);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("last identity")
      ) {
        return {
          content: t("account.unlink_last")
        };
      }

      throw error;
    }

    return {
      content: t("account.unlink_success", {
        platform: platformLabel(identity.platform)
      }),
      buttons: [
        {
          id: "account-after-unlink",
          label: t("account.open"),
          action: {
            type: "command",
            command: "/account"
          }
        },
        createBackButton(t),
        createCloseButton(t)
      ]
    };
  };
}

function handleSettings(
  context: CommandContext,
  communityService?: CommunityService,
  bridgeService?: BridgeService
): CommandResponse {
  const t = createTranslator(context.execution.locale);

  if (context.execution.type === "dm") {
    return {
      content: t("settings.dm"),
      buttons: [createBackButton(t), createCloseButton(t)]
    };
  }

  const community = context.execution.community;

  if (!community || !communityService) {
    return {
      content: t("settings.community_unavailable"),
      buttons: [createBackButton(t), createCloseButton(t)]
    };
  }

  let category = context.args[0]?.toLowerCase();

  if (category === "public" || category === "private") {
    context.args = ["general", category];
    category = "general";
  }

  if (category === "bridges") {
    return createBridgeSettingsResponse(context, bridgeService);
  }

  if (category === "general") {
    return createGeneralSettingsResponse(context, communityService);
  }

  return createCommunitySettingsCategoriesResponse(context);
}

function createCommunitySettingsCategoriesResponse(
  context: CommandContext
): CommandResponse {
  const t =
    createTranslator(
      context.execution.locale
    );

  return {
    content: t(
      "settings.categories.title"
    ),
    buttons: [
      {
        id: "settings-general",
        label: t("settings.category.general"),
        action: {
          type: "command",
          command: "/settings",
          args: ["general"]
        }
      },
      {
        id: "settings-bridges",
        label: t("settings.category.bridges"),
        action: {
          type: "command",
          command: "/settings",
          args: ["bridges"]
        }
      },
      createBackButton(t),
      createCloseButton(t)
    ]
  };
}

function createGeneralSettingsResponse(
  context: CommandContext,
  communityService?: CommunityService
): CommandResponse {
  const t =
    createTranslator(
      context.execution.locale
    );

  const community =
    context.execution.community;

  if (!community || !communityService) {
    return {
      content: t(
        "settings.community_unavailable"
      )
    };
  }

  let currentMode =
    community.mode ?? "public";

  if (
    context.args[1] === "public" ||
    context.args[1] === "private"
  ) {
    if (
      !context.execution.capabilities.includes(
        "community.manage"
      )
    ) {
      return {
        content: t("settings.forbidden")
      };
    }

    const updated =
      communityService.setMode(
        community.id,
        context.args[1]
      );

    currentMode =
      updated.mode ??
      context.args[1];
  }

  const canManage =
    context.execution.capabilities.includes(
      "community.manage"
    );

  return {
    content: [
      t("settings.category.general"),
      t(
        currentMode === "private"
          ? "settings.mode.private"
          : "settings.mode.public"
      )
    ].join("\n"),
    buttons: canManage
      ? [
          {
            id: "settings-general-public",
            label: t(
              "settings.mode.public_button"
            ),
            action: {
              type: "command",
              command: "/settings",
              args: ["general", "public"]
            }
          },
          {
            id: "settings-general-private",
            label: t(
              "settings.mode.private_button"
            ),
            action: {
              type: "command",
              command: "/settings",
              args: ["general", "private"]
            }
          },
          {
            id: "settings-general-back",
            label: t("menu.back"),
            action: {
              type: "command",
              command: "/settings"
            }
          },
          createCloseButton(t)
        ]
      : [
          {
            id: "settings-general-back",
            label: t("menu.back"),
            action: {
              type: "command",
              command: "/settings"
            }
          },
          createCloseButton(t)
        ]
  };
}

function createBridgeSettingsResponse(
  context: CommandContext,
  bridgeService?: BridgeService
): CommandResponse {
  const t =
    createTranslator(
      context.execution.locale
    );

  if (!bridgeService || !context.execution.community) {
    return {
      content: t(
        "settings.bridges.unavailable"
      )
    };
  }

  const bridges =
    bridgeService.getLinksForCommunity(
      context.execution.community.id
    );

  if (bridges.length === 0) {
    return {
      content: t("settings.bridges.empty"),
      buttons: [
        {
          id: "settings-bridges-back",
          label: t("menu.back"),
          action: {
            type: "command",
            command: "/settings"
          }
        },
        createCloseButton(t)
      ]
    };
  }

  return {
    content: t("settings.bridges.title"),
    buttons: [
      ...bridges.map((item) => ({
        id: `settings-bridge-${item.link.id}`,
        label: [
          item.first.platform === "telegram"
            ? "Telegram"
            : "Discord",
          item.first.communityName,
          item.first.channelName,
          "↔",
          item.second.platform === "telegram"
            ? "Telegram"
            : "Discord",
          item.second.communityName,
          item.second.channelName
        ].join(" · "),
        action: {
          type: "callback" as const,
          data:
            `settings.bridge.select:${item.link.id}`
        }
      })),
      {
        id: "settings-bridges-back",
        label: t("menu.back"),
        action: {
          type: "command",
          command: "/settings"
        }
      },
      createCloseButton(t)
    ]
  };
}

export function createCommunitySettingsInteractionHandler(
  bridgeService: BridgeService
): (
  context: InteractionHandlerContext
) => Promise<InteractionResponse> {
  return async (context) => {
    const data =
      context.action.type === "callback"
        ? context.action.data
        : "";

    const t =
      createTranslator(
        context.execution.locale
      );

    if (
      data.startsWith(
        "settings.bridge.select:"
      )
    ) {
      const linkId =
        data.slice(
          "settings.bridge.select:".length
        );

      const item =
        bridgeService
          .getLinksForCommunity(
            context.execution.community?.id ??
              ""
          )
          .find(
            (entry) =>
              entry.link.id === linkId
          );

      if (!item) {
        return {
          content: t(
            "settings.bridges.not_found"
          )
        };
      }

      return {
        content: [
          t("settings.bridge.title"),
          [
            item.first.platform === "telegram"
              ? "Telegram"
              : "Discord",
            item.first.communityName,
            item.first.channelName
          ].join(" · "),
          "↔",
          [
            item.second.platform === "telegram"
              ? "Telegram"
              : "Discord",
            item.second.communityName,
            item.second.channelName
          ].join(" · ")
        ].join("\n"),
        buttons: [
          {
            id: "settings-bridge-remove",
            label: t(
              "settings.bridge.remove"
            ),
            action: {
              type: "callback",
              data:
                `settings.bridge.remove:${linkId}`
            }
          },
          {
            id: "settings-bridge-back",
            label: t("menu.back"),
            action: {
              type: "command",
              command: "/settings",
              args: ["bridges"]
            }
          },
          createCloseButton(t)
        ]
      };
    }

    if (
      data.startsWith(
        "settings.bridge.remove:"
      )
    ) {
      const linkId =
        data.slice(
          "settings.bridge.remove:".length
        );

      if (
        !context.execution.capabilities.includes(
          "community.manage"
        )
      ) {
        return {
          content: t(
            "settings.forbidden"
          )
        };
      }

      const communityId =
        context.execution.community?.id;

      if (!communityId) {
        return {
          content: t(
            "settings.community_unavailable"
          )
        };
      }

      const item =
        bridgeService
          .getLinksForCommunity(
            communityId
          )
          .find(
            (entry) =>
              entry.link.id === linkId
          );

      if (!item) {
        return {
          content: t(
            "settings.bridges.not_found"
          )
        };
      }

      return {
        content: t(
          "settings.bridge.remove_confirm"
        ),
        buttons: [
          {
            id: "settings-bridge-remove-confirm",
            label: t(
              "settings.bridge.remove_confirm_button"
            ),
            action: {
              type: "callback",
              data:
                `settings.bridge.remove.confirm:${linkId}`
            }
          },
          {
            id: "settings-bridge-remove-cancel",
            label: t("menu.back"),
            action: {
              type: "callback",
              data:
                `settings.bridge.select:${linkId}`
            }
          },
          createCloseButton(t)
        ]
      };
    }

    if (
      data.startsWith(
        "settings.bridge.remove.confirm:"
      )
    ) {
      const linkId =
        data.slice(
          "settings.bridge.remove.confirm:".length
        );

      try {
        bridgeService.removeLink(
          linkId,
          context.execution
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "community.manage"
          )
        ) {
          return {
            content: t(
              "settings.forbidden"
            )
          };
        }

        return {
          content: t(
            "settings.bridges.not_found"
          )
        };
      }

      return {
        content: t(
          "settings.bridge.removed"
        ),
        buttons: [
          {
            id: "settings-bridges-back",
            label: t("menu.back"),
            action: {
              type: "command",
              command: "/settings",
              args: ["bridges"]
            }
          },
          createCloseButton(t)
        ]
      };
    }

    return {
      content: t(
        "interaction.unhandled"
      )
    };
  };
}

export function createBuiltinCommands(
  registry: CommandRegistry,
  communityService?: CommunityService,
  identityService?: IdentityService,
  membershipService?: MembershipService,
  accessControlService?: AccessControlService,
  database?: ModexaDatabase,
  bridgeService?: BridgeService
): void {
  const commands: CommandDefinition[] = [
    {
      name: "ping",
      descriptionKey:
        "command.ping.description",
      handler: (context) => ({
        content: createTranslator(
          context.execution?.locale
        )("command.ping.pong")
      })
    },
    {
      name: "menu",
      descriptionKey:
        "command.menu.description",
      handler: (context) =>
        createMenuResponse(
          createTranslator(
            context.execution?.locale
          ),
          context.execution.capabilities.includes(
            "system.manage"
          )
        )
    },
    {
      name: "account",
      descriptionKey:
        "command.account.description",
      requiredCapabilities: ["account.manage"],
      handler: (context) =>
        handleAccount(
          context,
          identityService
        )
    },
    {
      name: "system",
      descriptionKey:
        "command.system.description",
      requiredCapabilities: ["system.manage"],
      handler: (context) =>
        handleSystem(
          context,
          database
        )
    },
    {
      name: "settings",
      descriptionKey:
        "command.settings.description",
      handler: (context) =>
        handleSettings(
          context,
          communityService,
          bridgeService
        )
    },
    {
      name: "help",
      aliases: ["commands"],
      descriptionKey:
        "command.help.description",
      handler: (context) => {
        const t = createTranslator(
          context.execution?.locale
        );
        const available = registry
          .listAvailable(context.execution.capabilities)
          .filter((command) => command.name !== "menu");

        const groupFor = (name: string): string => {
          if ([
            "warn","mute","kick","ban","unmute","unban",
            "clear","warns","remwarn","resetwarns","case","modhistory"
          ].includes(name)) return "🛡 Модерация";
          if (["member","members","role"].includes(name)) return "👥 Участники";
          if (["settings","command"].includes(name)) return "⚙️ Настройки";
          if (["account","link"].includes(name)) return "🔗 Аккаунт";
          return "📦 Основное";
        };

        const groups = new Map<string, CommandDefinition[]>();
        for (const command of available) {
          const group = groupFor(command.name);
          const items = groups.get(group) ?? [];
          items.push(command);
          groups.set(group, items);
        }

        const category = context.args[0]?.toLowerCase();
        const categoryAliases: Record<string, string> = {
          moderation: "🛡 Модерация",
          mod: "🛡 Модерация",
          members: "👥 Участники",
          users: "👥 Участники",
          settings: "⚙️ Настройки",
          account: "🔗 Аккаунт",
          basic: "📦 Основное"
        };
        const selectedGroup = categoryAliases[category ?? ""];
        const entries = selectedGroup
          ? [[selectedGroup, groups.get(selectedGroup) ?? []] as const]
          : [...groups.entries()];

        const commandList = entries
          .map(([group, commands]) => {
            const lines = commands.map((command) => {
              const aliases =
                command.aliases && command.aliases.length > 0
                  ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
                  : "";
              const description =
                command.descriptionKey
                  ? t(command.descriptionKey)
                  : (command.description ?? t("help.no_description"));
              return `/${command.name}${aliases} — ${description}`;
            });
            return `**${group}**\\n${lines.join("\\n")}`;
          })
          .join("\\n\\n");

        const categoryButtons = [
          ["🛡 Модерация", "moderation"],
          ["👥 Участники", "members"],
          ["⚙️ Настройки", "settings"],
          ["🔗 Аккаунт", "account"],
          ["📦 Основное", "basic"]
        ]
          .filter(([label]) => !selectedGroup || label === selectedGroup)
          .map(([label, value]) => ({
            id: `help-${value}`,
            label,
            action: {
              type: "command" as const,
              command: "/help",
              args: [value]
            }
          }));

        return {
          content: commandList
            ? `${t("help.title")}\\n\\n${commandList}`
            : t("help.empty"),
          buttons: [
            ...categoryButtons,
            ...(selectedGroup ? [createBackButton(t)] : []),
            createCloseButton(t)
          ]
        };
      }}
  ];

  for (const command of commands) {
    registry.register(command);
  }
}
