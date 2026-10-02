import { CommandParser } from "./parser.js";
import { CommandRegistry } from "./commands.js";

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
    private readonly logger?: Logger
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

    const response =
      await this.registry.execute(
        parsed.name,
        commandContext
      );

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
        command:
          parsed.name,
        contextType:
          execution.type
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