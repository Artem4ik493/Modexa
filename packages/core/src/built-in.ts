import type {
  CommandDefinition
} from "./types.js";
import type { CommandRegistry } from "./commands.js";

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
      name: "help",
      aliases: ["commands"],
      description: "Show available commands",
      handler: () => {
        const commandList = registry
          .list()
          .map((command) => {
            const aliases =
              command.aliases && command.aliases.length > 0
                ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
                : "";

            const description =
              command.description ?? "No description";

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