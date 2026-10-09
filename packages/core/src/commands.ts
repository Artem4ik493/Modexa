import type {
  CommandContext,
  CommandDefinition,
  CommandResponse
} from "./types.js";

import type { ExecutionCapability } from "./contexts/types.js";
import type { Permission } from "./access/types.js";
import type { CommandSettingsService } from "./commands/settings.js";

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

  listAvailable(
    capabilities: readonly ExecutionCapability[],
    permissions: readonly Permission[] = []
  ): CommandDefinition[] {
    const availableCapabilities = new Set(capabilities);
    const availablePermissions = new Set(permissions);

    return this.list().filter((command) => {
      const capabilitiesAllowed =
        (command.requiredCapabilities ?? []).every(
          (capability) => availableCapabilities.has(capability)
        );
      const requiredPermissions = command.requiredPermissions;

      // Context-dependent commands are shown when their broad capability
      // is present; CommandService resolves the exact permission at runtime.
      const permissionsAllowed =
        typeof requiredPermissions === "function" ||
        (requiredPermissions ?? []).every(
          (permission) => availablePermissions.has(permission)
        );

      return capabilitiesAllowed && permissionsAllowed;
    });
  }
}