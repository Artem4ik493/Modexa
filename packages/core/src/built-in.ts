import type {
  CommandDefinition,
  CommandResponse
} from "./types.js";

import type { CommandRegistry } from "./commands.js";

import type {
  InteractionDispatcher
} from "./interactions/dispatcher.js";

import type {
  InteractionButton,
  InteractionResponse
} from "./interactions/types.js";

/**
 * Temporary smoke-test menu. To be replaced by real
 * Modexa commands (/account, /settings, ...).
 */
function createMenuResponse(): CommandResponse {
  return {
    content: "Choose an action:",
    buttons: [
      {
        id: "account",
        label: "Account",
        action: {
          type: "callback",
          data: "account"
        }
      },
      {
        id: "settings",
        label: "Settings",
        action: {
          type: "callback",
          data: "settings"
        }
      },
      {
        id: "website",
        label: "Website",
        action: {
          type: "link",
          url: "https://example.com"
        }
      }
    ]
  };
}

function createBackButton(): InteractionButton {
  return {
    id: "back",
    label: "Back",
    action: {
      type: "callback",
      data: "menu"
    }
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
      description: "Show interaction menu",
      handler: () => createMenuResponse()
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

/**
 * Temporary smoke-test interaction handlers for the
 * /menu buttons. Platform-agnostic on purpose.
 */
export function registerBuiltinInteractions(
  dispatcher: InteractionDispatcher
): void {
  dispatcher.registerCallback(
    "menu",
    (): InteractionResponse =>
      createMenuResponse()
  );

  dispatcher.registerCallback(
    "account",
    ({ execution }): InteractionResponse => ({
      content: [
        "Account",
        `Name: ${execution.user.displayName}`,
        `ID: ${execution.user.id}`,
        `Context: ${execution.type}`
      ].join("\n"),
      buttons: [createBackButton()]
    })
  );

  dispatcher.registerCallback(
    "settings",
    (): InteractionResponse => ({
      content:
        "Settings\nNothing to configure yet.",
      buttons: [createBackButton()]
    })
  );
}