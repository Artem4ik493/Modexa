import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "./types.js";

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition): void {
    const name = command.name.toLowerCase();

    this.commands.set(name, command);

    for (const alias of command.aliases ?? []) {
      this.commands.set(alias.toLowerCase(), command);
    }
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase());
  }

  async execute(
    name: string,
    context: CommandContext
  ): Promise<CommandResponse | null> {
    const command = this.get(name);

    if (!command) {
      return null;
    }

    return command.handler(context);
  }

  list(): CommandDefinition[] {
    return [...new Set(this.commands.values())];
  }
}