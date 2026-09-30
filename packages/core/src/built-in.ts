import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "./types.js";

import type { CommandRegistry } from "./commands.js";

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
      }
    ]
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
    buttons: [createBackButton(t)]
  };
}

function handleSettings(
  context: CommandContext
): CommandResponse {
  const t = createTranslator(
    context.execution.locale
  );

  if (context.execution.type !== "dm") {
    return {
      content: t(
        "settings.community_unavailable"
      ),
      buttons: [createBackButton(t)]
    };
  }

  return {
    content: t("settings.dm"),
    buttons: [createBackButton(t)]
  };
}

export function createBuiltinCommands(
  registry: CommandRegistry
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
      handler: handleAccount
    },
    {
      name: "settings",
      descriptionKey:
        "command.settings.description",
      handler: handleSettings
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
          .list()
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