import { CommandParser } from "./parser.js";
import { CommandRegistry } from "./commands.js";
import type { CommandSettingsService } from "./commands/settings.js";

import type {
  CommandContext,
  CommandResponse
} from "./types.js";

import type {
  ExecutionContext
} from "./contexts/types.js";

import type {
  Logger
} from "./diagnostics/types.js";

import {
  createDiagnosticContext
} from "./diagnostics/context.js";

import {
  translate
} from "./i18n/translate.js";

export interface CommandServiceResult {
  handled: boolean;
  response:
    | CommandResponse
    | null;
}

export class CommandService {
  constructor(
    private readonly parser: CommandParser,
    private readonly registry: CommandRegistry,
    private readonly logger?: Logger,
    private readonly commandSettings?: CommandSettingsService
  ) {}

  async handle(
    input: string,
    context: Omit<
      CommandContext,
      "args" | "rawText"
    >,
    execution: ExecutionContext
  ): Promise<CommandServiceResult> {
    const diagnostics =
      createDiagnosticContext({
        correlationId:
          execution.correlationId,

        platform:
          execution.platform,

        userId:
          execution.user.id,

        communityId:
          execution.community?.id
      });

    this.logger?.debug(
      "command.received",
      diagnostics
    );

    const parsed =
      this.parser.parse(input);

    if (!parsed) {
      this.logger?.debug(
        "command.ignored",
        {
          ...diagnostics,
          reason:
            "input_is_not_a_command"
        }
      );

      return {
        handled: false,
        response: null
      };
    }

    this.logger?.debug(
      "command.parsed",
      {
        ...diagnostics,
        command:
          parsed.name,
        argumentCount:
          parsed.args.length
      }
    );

    if (
      execution.type ===
        "community" &&
      !execution.capabilities.includes(
        "commands"
      )
    ) {
      this.logger?.debug(
        "command.forbidden",
        {
          ...diagnostics,
          command:
            parsed.name
        }
      );

      return {
        handled: true,
        response: {
          content:
            translate(
              "command.forbidden",
              undefined,
              execution.locale
            )
        }
      };
    }

    const command =
      this.registry.get(parsed.name);


    if (
      command &&
      execution.community &&
      this.commandSettings &&
      command.name !== "help" &&
      command.name !== "command" &&
      !this.commandSettings.isEnabled(
        execution.community.id,
        command.name
      )
    ) {
      this.logger?.debug(
        "command.disabled",
        {
          ...diagnostics,
          command: parsed.name
        }
      );

      return {
        handled: true,
        response: {
          content: translate(
            "command.disabled",
            undefined,
            execution.locale
          )
        }
      };
    }


    const missingCapabilities =
      (command?.requiredCapabilities ?? []).filter(
        (capability) => !execution.capabilities.includes(capability)
      );
    const missingPermissions =
      (command?.requiredPermissions ?? []).filter(
        (permission) => !(execution.permissions ?? []).includes(permission)
      );

    if (
      command &&
      (missingCapabilities.length > 0 || missingPermissions.length > 0)
    ) {
      this.logger?.debug(
        "command.capability_forbidden",
        {
          ...diagnostics,
          command: parsed.name,
          userId: execution.user.id,
          communityId: execution.community?.id,
          missingCapabilities,
          missingPermissions,
          grantedCapabilities: execution.capabilities,
          grantedPermissions: execution.permissions ?? []
        }
      );

      return {
        handled: true,
        response: {
          content: translate(
            "command.permission_denied",
            undefined,
            execution.locale
          )
        }
      };
    }

    const commandContext:
      CommandContext = {
        ...context,

        platform:
          execution.platform,

        user:
          execution.user,

        community:
          execution.community,

        channel:
          execution.channel,

        execution,

        args:
          parsed.args,

        rawText:
          input
      };

    let response: CommandResponse | null;
    try {
      response = await this.registry.execute(
        parsed.name,
        commandContext
      );
    } catch (error) {
      this.logger?.error(
        "command.execution_failed",
        {
          ...diagnostics,
          command: parsed.name,
          userId: execution.user.id,
          communityId: execution.community?.id
        },
        error
      );

      return {
        handled: true,
        response: {
          content: translate(
            "command.execution_failed",
            { correlationId: execution.correlationId },
            execution.locale
          )
        }
      };
    }

    if (!response) {
      this.logger?.debug(
        "command.not_found",
        {
          ...diagnostics,
          command:
            parsed.name
        }
      );

      return {
        handled: true,
        response: {
          content: translate(
            "command.not_found",
            {
              role: this.resolveRoleLabel(
                execution
              )
            },
            execution.locale
          )
        }
      };
    }

    this.logger?.debug(
      "command.executed",
      {
        ...diagnostics,
        command: parsed.name,
        contextType: execution.type,
        userId: execution.user.id,
        communityId: execution.community?.id,
        responseHasContent: Boolean(response.content),
        responseHasButtons: Boolean(response.buttons?.length),
        responseHasMenus: Boolean(response.menus?.length)
      }
    );

    return {
      handled: true,
      response
    };
  }

  private resolveRoleLabel(
    execution: ExecutionContext
  ): string {
    if (
      execution.type === "community" &&
      execution.capabilities.includes(
        "community.manage"
      )
    ) {
      return "admin";
    }

    if (
      execution.type === "community" &&
      execution.capabilities.includes(
        "community.view"
      )
    ) {
      return "member";
    }

    return "user";
  }
}