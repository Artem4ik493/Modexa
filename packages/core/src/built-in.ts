import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "./types.js";

import type { CommandRegistry } from "./commands.js";

function createMenuResponse(): CommandResponse {
  return {
    content: "Choose an action:",
    buttons: [
      {
        id: "account",
        label: "Account",
        action: {
          type: "command",
          command: "/account"
        }
      },
      {
        id: "settings",
        label: "Settings",
        action: {
          type: "command",
          command: "/settings"
        }
      }
    ]
  };
}

function createBackButton() {
  return {
    id: "back",
    label: "Back",
    action: {
      type: "command" as const,
      command: "/menu"
    }
  };
}

function handleAccount(
  context: CommandContext
): CommandResponse {
  const { execution } = context;

  if (
    !execution.capabilities.includes(
      "account.manage"
    )
  ) {
    return {
      content:
        "Account management is only available in a private chat with the bot."
    };
  }

  return {
    content: [
      "Account",
      `Name: ${execution.user.displayName}`,
      `ID: ${execution.user.id}`,
      `Context: ${execution.type}`
    ].join("\n"),
    buttons: [createBackButton()]
  };
}

function handleSettings(
  context: CommandContext
): CommandResponse {
  if (context.execution.type !== "dm") {
    return {
      content:
        "Community settings are not available yet.",
      buttons: [createBackButton()]
    };
  }

  return {
    content:
      "Settings\nNothing to configure yet.",
    buttons: [createBackButton()]
  };
}

export function createBuiltinCommands(
  registry: CommandRegistry
): void {
  const commands: CommandDefinition[] = [
    {
      name: "ping",
      description: "Check if Modexa is alive",
      handler: () => ({
        content: "Pong!"
      })
    },
    {
      name: "menu",
      description: "Show the main menu",
      handler: () => createMenuResponse()
    },
    {
      name: "account",
      description: "Show your Modexa account",
      handler: handleAccount
    },
    {
      name: "settings",
      description: "Show settings",
      handler: handleSettings
    },
    {
      name: "help",
      aliases: ["commands"],
      description: "Show available commands",
      handler: () => {
        const commandList = registry
          .list()
          .map((command) => {
            const aliases =
              command.aliases &&
              command.aliases.length > 0
                ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
                : "";

            const description =
              command.description ??
              "No description";

            return `/${command.name}${aliases} — ${description}`;
          })
          .join("\n");

        return {
          content: commandList
            ? `Available commands:\n${commandList}`
            : "No commands available."
        };
      }
    }
  ];

  for (const command of commands) {
    registry.register(command);
  }
}