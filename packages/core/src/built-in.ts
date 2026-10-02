import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "./types.js";

import type { CommandRegistry } from "./commands.js";

import type { CommunityService } from "./communities/service.js";

import type {
  InteractionButton
} from "./interactions/types.js";

import {
  createTranslator,
  type Translator
} from "./i18n/translate.js";

function createMenuResponse(
  t: Translator
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

function handleAccount(
  context: CommandContext
): CommandResponse {
  const { execution } = context;

  const t = createTranslator(
    execution.locale
  );

  if (
    !execution.capabilities.includes(
      "account.manage"
    )
  ) {
    return {
      content: t("account.dm_only")
    };
  }

  return {
    content: [
      t("account.title"),
      t("account.name", {
        name: execution.user.displayName
      }),
      t("account.id", {
        id: execution.user.id
      }),
      t("account.context", {
        context: t(
          execution.type === "dm"
            ? "context.dm"
            : "context.community"
        )
      })
    ].join("\n"),
    buttons: [
      {
        id: "account-link",
        label: t("account.link"),
        action: {
          type: "command",
          command: "/link"
        }
      },
      createBackButton(t),
      createCloseButton(t)
    ]
  };
}

function handleSettings(
  context: CommandContext,
  communityService?: CommunityService
): CommandResponse {
  const t = createTranslator(
    context.execution.locale
  );

  if (context.execution.type === "dm") {
    return {
      content: t("settings.dm"),
      buttons: [
        createBackButton(t),
        createCloseButton(t)
      ]
    };
  }

  const community = context.execution.community;

  if (!community || !communityService) {
    return {
      content: t("settings.community_unavailable"),
      buttons: [
        createBackButton(t),
        createCloseButton(t)
      ]
    };
  }

  const mode = context.args[0]?.toLowerCase();
  let currentMode =
    community.mode ?? "public";

  if (mode === "public" || mode === "private") {
    if (
      !context.execution.capabilities.includes(
        "community.manage"
      )
    ) {
      return {
        content: t("settings.forbidden"),
        buttons: [
          createBackButton(t),
          createCloseButton(t)
        ]
      };
    }

    const updated =
      communityService.setMode(
        community.id,
        mode
      );

    currentMode =
      updated.mode ?? mode;
  }

  const canManage =
    context.execution.capabilities.includes(
      "community.manage"
    );

  return {
    content: [
      t("settings.community"),
      t(
        community.mode === "private"
          ? "settings.mode.private"
          : "settings.mode.public"
      )
    ].join("\n"),
    buttons: canManage
      ? [
          {
            id: "settings-public",
            label: t("settings.mode.public_button"),
            action: {
              type: "command" as const,
              command: "/settings",
              args: ["public"]
            }
          },
          {
            id: "settings-private",
            label: t("settings.mode.private_button"),
            action: {
              type: "command" as const,
              command: "/settings",
              args: ["private"]
            }
          },
          createBackButton(t),
          createCloseButton(t)
        ]
      : [
          createBackButton(t),
          createCloseButton(t)
        ]
  };
}

export function createBuiltinCommands(
  registry: CommandRegistry,
  communityService?: CommunityService
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
          )
        )
    },
    {
      name: "account",
      descriptionKey:
        "command.account.description",
      requiredCapabilities: ["account.manage"],
      handler: handleAccount
    },
    {
      name: "settings",
      descriptionKey:
        "command.settings.description",
      handler: (context) =>
        handleSettings(
          context,
          communityService
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

        const commandList = registry
          .listAvailable(context.execution.capabilities)
          .map((command) => {
            const aliases =
              command.aliases &&
              command.aliases.length > 0
                ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
                : "";

            const description =
              command.descriptionKey
                ? t(command.descriptionKey)
                : (command.description ??
                  t("help.no_description"));

            return `/${command.name}${aliases} — ${description}`;
          })
          .join("\n");

        return {
          content: commandList
            ? `${t("help.title")}\n${commandList}`
            : t("help.empty")
        };
      }
    }
  ];

  for (const command of commands) {
    registry.register(command);
  }
}
