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
        id: "help",
        label: t("menu.help"),
        action: {
          type: "command",
          command: "/help"
        }
      },
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
  bridgeService?: BridgeService,
  database?: ModexaDatabase
): CommandResponse {
  const t = createTranslator(context.execution.locale);

  if (context.execution.type === "dm") {
    const category = context.args[0]?.toLowerCase() ?? "";
    const action = context.args[1]?.toLowerCase() ?? "";
    const userId = context.execution.user.id;

    if (category === "language") {
      if (action === "ru" || action === "en") {
        database?.setUserSetting(userId, "locale", action);
        context.execution.locale = action;
      } else if (action === "auto") {
        database?.deleteUserSetting(userId, "locale");
      }
      return createPersonalAccountSettingsResponse(context, database);
    }
    if (category === "notifications" && action === "toggle") {
      const enabled = database?.getUserSetting(userId, "notifications.enabled") !== "false";
      database?.setUserSetting(userId, "notifications.enabled", String(!enabled));
      return createPersonalSettingsCategoryResponse(context, database, "notifications");
    }
    if (category === "privacy" && action === "toggle") {
      const visible = database?.getUserSetting(userId, "profile.visible") !== "false";
      database?.setUserSetting(userId, "profile.visible", String(!visible));
      return createPersonalSettingsCategoryResponse(context, database, "privacy");
    }
    if (category === "account") return createPersonalAccountSettingsResponse(context, database);
    if (category === "notifications" || category === "privacy") return createPersonalSettingsCategoryResponse(context, database, category);

    const savedLocale = database?.getUserSetting(userId, "locale");
    const personalTranslator = createTranslator(savedLocale === "en" || savedLocale === "ru" ? savedLocale : context.execution.locale === "en" ? "en" : "ru");
    return {
      content: personalTranslator("settings.personal.categories.title"),
      buttons: [
        { id: "settings-personal-account", label: personalTranslator("settings.personal.category.account"), action: { type: "command", command: "/settings", args: ["account"] } },
        { id: "settings-personal-notifications", label: personalTranslator("settings.personal.category.notifications"), action: { type: "command", command: "/settings", args: ["notifications"] } },
        { id: "settings-personal-privacy", label: personalTranslator("settings.personal.category.privacy"), action: { type: "command", command: "/settings", args: ["privacy"] } },
        createBackButton(personalTranslator), createCloseButton(personalTranslator)
      ]
    };
  }

  const community = context.execution.community;
  if (!community || !communityService) return { content: t("settings.community_unavailable"), buttons: [createBackButton(t), createCloseButton(t)] };

  const category = context.args[0]?.toLowerCase() ?? "";
  if (category === "public" || category === "private") {
    context.args = ["general", category];
    return createGeneralSettingsResponse(context, communityService);
  }
  if (category === "bridges") return createBridgeSettingsResponse(context, bridgeService);
  if (category === "general") return createGeneralSettingsResponse(context, communityService);

  if (["members", "moderation", "access", "automations"].includes(category)) {
    const settingsCategory = category as "members" | "moderation" | "access" | "automations";
    const settingKey = ({ members: "members.list_visible", moderation: "moderation.logging_enabled", access: "access.member_profile_visible", automations: "automations.enabled" } as const)[settingsCategory];
    if (context.args[1]?.toLowerCase() === "toggle") {
      if (!context.execution.capabilities.includes("community.manage")) return { content: t("settings.forbidden"), buttons: [createBackButton(t), createCloseButton(t)] };
      const current = database?.getCommunitySetting(community.id, settingKey) !== "false";
      database?.setCommunitySetting(community.id, settingKey, String(!current));
    }
    const current = database?.getCommunitySetting(community.id, settingKey) !== "false";
    const titleKey = ({ members: "settings.category.members", moderation: "settings.category.moderation", access: "settings.category.access", automations: "settings.category.automations" } as const)[settingsCategory];
    const descriptionKey = ({ members: "settings.category.members.description", moderation: "settings.category.moderation.description", access: "settings.category.access.description", automations: "settings.category.automations.description" } as const)[settingsCategory];
    const canManage = context.execution.capabilities.includes("community.manage");
    return {
      content: [t(titleKey), t("settings.section.description"), t(descriptionKey), current ? t("settings.value.enabled") : t("settings.value.disabled")].join("\n"),
      buttons: [
        ...(canManage ? [{ id: `settings-${category}-toggle`, label: t("settings.toggle"), action: { type: "command" as const, command: "/settings", args: [category, "toggle"] } }] : []),
        { id: `settings-${category}-back`, label: t("menu.back"), action: { type: "command", command: "/settings" } },
        createCloseButton(t)
      ]
    };
  }
  return createCommunitySettingsCategoriesResponse(context);
}

function createPersonalAccountSettingsResponse(context: CommandContext, database?: ModexaDatabase): CommandResponse {
  const savedLocale = database?.getUserSetting(context.execution.user.id, "locale");
  const locale = savedLocale === "en" || savedLocale === "ru" ? savedLocale : context.execution.locale === "en" ? "en" : "ru";
  const t = createTranslator(locale);
  return {
    content: [t("settings.personal.title"), t("settings.personal.account.description"), t("settings.personal.language"), t(savedLocale === "en" ? "settings.personal.language.en_selected" : savedLocale === "ru" ? "settings.personal.language.ru_selected" : "settings.personal.language.auto_selected")].join("\n"),
    buttons: [
      { id: "settings-language-ru", label: t("settings.personal.language.ru"), action: { type: "command", command: "/settings", args: ["language", "ru"] } },
      { id: "settings-language-en", label: t("settings.personal.language.en"), action: { type: "command", command: "/settings", args: ["language", "en"] } },
      { id: "settings-language-auto", label: t("settings.personal.language.auto"), action: { type: "command", command: "/settings", args: ["language", "auto"] } },
      { id: "settings-personal-back", label: t("menu.back"), action: { type: "command", command: "/settings" } }, createCloseButton(t)
    ]
  };
}

function createPersonalSettingsCategoryResponse(context: CommandContext, database: ModexaDatabase | undefined, category: "notifications" | "privacy"): CommandResponse {
  const savedLocale = database?.getUserSetting(context.execution.user.id, "locale");
  const t = createTranslator(savedLocale === "en" || savedLocale === "ru" ? savedLocale : context.execution.locale === "en" ? "en" : "ru");
  const notifications = category === "notifications";
  const settingKey = notifications ? "notifications.enabled" : "profile.visible";
  const enabled = database?.getUserSetting(context.execution.user.id, settingKey) !== "false";
  return {
    content: [
      t(notifications ? "settings.personal.category.notifications" : "settings.personal.category.privacy"),
      t(notifications ? "settings.personal.notifications.description" : "settings.personal.privacy.description"),
      t(notifications ? enabled ? "settings.personal.notifications.state.on" : "settings.personal.notifications.state.off" : enabled ? "settings.personal.privacy.state.on" : "settings.personal.privacy.state.off")
    ].join("\n"),
    buttons: [
      { id: `settings-personal-${category}-toggle`, label: t(notifications ? "settings.personal.notifications.toggle" : "settings.personal.privacy.toggle"), action: { type: "command", command: "/settings", args: [category, "toggle"] } },
      { id: "settings-personal-back", label: t("menu.back"), action: { type: "command", command: "/settings" } }, createCloseButton(t)
    ]
  };
}

function createCommunitySettingsCategoriesResponse(context: CommandContext): CommandResponse {
  const t = createTranslator(context.execution.locale);
  return {
    content: t("settings.categories.title"),
    buttons: [
      { id: "settings-general", label: t("settings.category.general"), action: { type: "command", command: "/settings", args: ["general"] } },
      { id: "settings-members", label: t("settings.category.members"), action: { type: "command", command: "/settings", args: ["members"] } },
      { id: "settings-moderation", label: t("settings.category.moderation"), action: { type: "command", command: "/settings", args: ["moderation"] } },
      { id: "settings-access", label: t("settings.category.access"), action: { type: "command", command: "/settings", args: ["access"] } },
      { id: "settings-bridges", label: t("settings.category.bridges"), action: { type: "command", command: "/settings", args: ["bridges"] } },
      { id: "settings-automations", label: t("settings.category.automations"), action: { type: "command", command: "/settings", args: ["automations"] } },
      createBackButton(t), createCloseButton(t)
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
          bridgeService,
          database
        )
    },
    {
      name: "help",
      descriptionKey: "command.help.description",
      handler: (context) => {
        const t = createTranslator(context.execution.locale);
        const available = registry
          .listAvailable(context.execution.capabilities, context.execution.permissions ?? [])
          .filter((command) => command.name !== "commands");
        const categoryDefinitions = [
          { id: "information", label: t("help.category.information"), icon: "📋", names: ["help", "ping", "account", "link", "system"] },
          { id: "members", label: t("help.category.members"), icon: "👥", names: ["member", "members", "user", "profile", "role"] },
          { id: "moderation", label: t("help.category.moderation"), icon: "🛡️", names: ["warn", "warns", "remwarn", "resetwarns", "mute", "unmute", "mutes", "kick", "ban", "unban", "case", "modhistory", "clear"] },
          { id: "community", label: t("help.category.community"), icon: "🌐", names: ["settings", "bridge-test", "bridgetest"] },
          { id: "account", label: t("help.category.account"), icon: "🔗", names: ["link", "link-account", "linkaccount", "account"] },
          { id: "utilities", label: t("help.category.utilities"), icon: "🧰", names: ["commands", "menu"] }
        ];
        const requestedSection = context.args[0]?.toLowerCase() ?? "home";
        const directCategory = categoryDefinitions.some((item) => item.id === requestedSection);
        const directCommand = available.some((item) => item.name === requestedSection || item.aliases?.includes(requestedSection));
        const section = requestedSection === "category" || requestedSection === "command"
          ? requestedSection
          : directCategory
            ? "category"
            : directCommand
              ? "command"
              : "home";
        const commandName = section === "category"
          ? (requestedSection === "category" ? context.args[1]?.toLowerCase() : requestedSection)
          : section === "command"
            ? (requestedSection === "command" ? context.args[1]?.toLowerCase() : requestedSection)
            : context.args[1]?.toLowerCase();
        const pageArg = Number.parseInt(context.args[2] ?? "1", 10);
        const pageSize = 5;
        const commandDetails: Record<string, { usage: string; examples: string[]; notes?: string }> = {
          help: { usage: "/help [категория или команда]", examples: ["/help", "/help moderation", "/help member"] },
          commands: { usage: "/commands", examples: ["/commands"] },
          ping: { usage: "/ping", examples: ["/ping"] },
          menu: { usage: "/menu", examples: ["/menu"] },
          account: { usage: "/account", examples: ["/account"], notes: t("help.dm_note") },
          link: { usage: "/link [код]", examples: ["/link", "/link 123456"], notes: t("help.dm_note") },
          settings: { usage: "/settings [раздел]", examples: ["/settings", "/settings general", "/settings bridges"] },
          member: { usage: "/member [участник]", examples: ["/member", "/member @username"] },
          members: { usage: "/members [страница]", examples: ["/members", "/members 2"] },
          role: { usage: "/role <участник> [роль]", examples: ["/role @username", "/role @username MEMBER"] },
          "bridge-test": { usage: "/bridge-test", examples: ["/bridge-test"] },
          bridgetest: { usage: "/bridgetest", examples: ["/bridgetest"] },
          system: { usage: "/system [settings|maintenance]", examples: ["/system", "/system settings", "/system maintenance on"] },
          clear: { usage: "/clear <количество>", examples: ["/clear 10"] },
          mute: { usage: "/mute <участник> <срок> [причина]", examples: ["/mute @username 10m Спам", "/mute @username 2h"] },
          warn: { usage: "/warn <участник> [причина]", examples: ["/warn @username Флуд"] },
          kick: { usage: "/kick <участник> [причина]", examples: ["/kick @username Нарушение правил"] },
          ban: { usage: "/ban <участник> [причина]", examples: ["/ban @username Спам"] }
        };
        const commandLabel = (name: string) => `/${name}`;
        const commandDescription = (name: string) => {
          const command = available.find((item) => item.name === name);
          return command?.descriptionKey ? t(command.descriptionKey) : command?.description ?? t("help.no_description");
        };
        const categoryCommands = (id: string) => {
          const category = categoryDefinitions.find((item) => item.id === id);
          if (!category) return [];
          const names = new Set(category.names);
          return available.filter((command) => names.has(command.name));
        };
        const backToHome: InteractionButton = {
          id: "help-home",
          label: t("help.all_categories"),
          action: { type: "command", command: "/help" }
        };
        const buttons: InteractionButton[] = [];
        let content = "";
        if (section === "category") {
          const categoryId = commandName ?? "";
          const category = categoryDefinitions.find((item) => item.id === categoryId);
          if (!category) {
            return { content: t("help.category_missing"), buttons: [backToHome, createCloseButton(t)] };
          }
          const commands = categoryCommands(categoryId);
          const totalPages = Math.max(1, Math.ceil(commands.length / pageSize));
          const page = Number.isFinite(pageArg) ? Math.min(Math.max(pageArg, 1), totalPages) : 1;
          const pageCommands = commands.slice((page - 1) * pageSize, page * pageSize);
          content = `## ${t("help.category_heading", { category: category.label })} ${category.icon}\n\n${t("help.intro")}`;
          buttons.push(backToHome);
          for (const command of pageCommands) {
            buttons.push({
              id: `help-command-${command.name}`,
              label: `/${command.name}`,
              action: { type: "command", command: "/help", args: ["command", command.name] }
            });
          }
          if (totalPages > 1) {
            buttons.push({
              id: "help-first",
              label: "⏮",
              action: { type: "command", command: "/help", args: ["category", categoryId, "1"] },
              disabled: page === 1
            });
            buttons.push({
              id: "help-prev",
              label: "◀",
              action: { type: "command", command: "/help", args: ["category", categoryId, String(Math.max(1, page - 1))] },
              disabled: page === 1
            });
            buttons.push({
              id: "help-next",
              label: "▶",
              action: { type: "command", command: "/help", args: ["category", categoryId, String(Math.min(totalPages, page + 1))] },
              disabled: page === totalPages
            });
            buttons.push({
              id: "help-last",
              label: "⏭",
              action: { type: "command", command: "/help", args: ["category", categoryId, String(totalPages)] },
              disabled: page === totalPages
            });
          }
          content += `\n\n${pageCommands.map((command) => `**/${command.name}**\n${command.descriptionKey ? t(command.descriptionKey) : command.description ?? t("help.no_description")}`).join("\n\n")}\n\n${t("help.page", { page: String(page), total: String(totalPages), count: String(commands.length) })}`;
        } else if (section === "command") {
          const name = commandName ?? "";
          const command = available.find((item) => item.name === name || item.aliases?.includes(name));
          if (!command) {
            return { content: t("help.command_missing"), buttons: [backToHome, createCloseButton(t)] };
          }
          const detail = commandDetails[command.name] ?? commandDetails[name];
          const category = categoryDefinitions.find((item) => item.names.includes(command.name));
          const description = command.descriptionKey ? t(command.descriptionKey) : command.description ?? t("help.no_description");
          const usage = detail?.usage ?? `/${command.name} [аргументы]`;
          const examples = detail?.examples ?? [`/${command.name}`];
          content = [
            `## ${t("help.command_title", { command: commandLabel(command.name) })}`,
            "",
            `**${description}**`,
            "",
            t("help.command_description"),
            "",
            `### ${t("help.usage")}`,
            "",
            String.fromCharCode(96) + usage + String.fromCharCode(96),
            "",
            `### ${t("help.examples")}`,
            "",
            ...examples.flatMap((example, index) => [
              `**${t("help.example", { number: String(index + 1) })}**`,
              String.fromCharCode(96) + example + String.fromCharCode(96)
            ]),
            ...(detail?.notes ? ["", detail.notes] : [])
          ].join("\n");
          buttons.push(backToHome);
          if (category) {
            buttons.push({
              id: "help-category",
              label: category.label,
              action: { type: "command", command: "/help", args: ["category", category.id] }
            });
          }
        } else {
          content = `# ${t("help.title")}\n\n${t("help.intro")}\n\n${t("help.select_category")}`;
          buttons.push({
            id: "help-menu",
            label: t("menu.title"),
            action: { type: "command", command: "/menu" }
          });
          for (const category of categoryDefinitions) {
            const count = categoryCommands(category.id).length;
            if (count === 0) continue;
            buttons.push({
              id: `help-category-${category.id}`,
              label: `${category.icon} ${category.label} · ${count}`,
              action: { type: "command", command: "/help", args: ["category", category.id] }
            });
          }
          buttons.push({
            id: "help-open-commands",
            label: t("help.open_commands"),
            action: { type: "command", command: "/commands" }
          });
        }
        buttons.push(createCloseButton(t));
        return { content, format: "markdown", buttons };
      }
    },
    {
      name: "commands",
      descriptionKey: "command.commands.description",
      handler: (context) => {
        const t = createTranslator(context.execution.locale);
        const available = registry
          .listAvailable(context.execution.capabilities, context.execution.permissions ?? [])
          .filter((command) => command.name !== "menu" && command.name !== "help" && command.name !== "commands");
        const groupFor = (name: string): string => {
          if (["warn", "mute", "kick", "ban", "unmute", "unban", "clear", "warns", "remwarn", "resetwarns", "case", "modhistory", "mutes", "mute-list", "warnings"].includes(name)) return t("commands.group.moderation");
          if (["member", "members", "role", "user", "profile"].includes(name)) return t("commands.group.members");
          if (["settings", "command", "server", "community"].includes(name)) return t("commands.group.settings");
          if (["account", "link"].includes(name)) return t("commands.group.account");
          return t("commands.group.general");
        };
        const groups = new Map<string, CommandDefinition[]>();
        for (const command of available) {
          const group = groupFor(command.name);
          const list = groups.get(group) ?? [];
          list.push(command);
          groups.set(group, list);
        }
        const content = [...groups.entries()].map(([group, commands]) =>
          `**${group}**\n${commands.map((command) => {
            const aliases = command.aliases?.length ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})` : "";
            const description = command.descriptionKey ? t(command.descriptionKey) : command.description ?? t("help.no_description");
            return `/${command.name}${aliases} — ${description}`;
          }).join("\n")}`
        ).join("\n\n");
        return {
          content: content || t("help.empty"),
          buttons: [
            { id: "commands-help", label: t("help.home"), action: { type: "command", command: "/help" } },
            createCloseButton(t)
          ]
        };
      }
    }
  ];

  for (const command of commands) {
    registry.register(command);
  }
}
