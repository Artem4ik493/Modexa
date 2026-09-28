import { CommandParser } from "./parser.js";
import { CommandRegistry } from "./commands.js";
import type {
  CommandContext,
  CommandResponse
} from "./types.js";

export interface CommandServiceResult {
  handled: boolean;
  response: CommandResponse | null;
}

export class CommandService {
  constructor(
    private readonly parser: CommandParser,
    private readonly registry: CommandRegistry
  ) {}

  async handle(
    input: string,
    context: Omit<CommandContext, "args" | "rawText">
  ): Promise<CommandServiceResult> {
    const parsed = this.parser.parse(input);

    if (!parsed) {
      return {
        handled: false,
        response: null
      };
    }

    const commandContext: CommandContext = {
      ...context,
      args: parsed.args,
      rawText: input
    };

    const response = await this.registry.execute(
      parsed.name,
      commandContext
    );

    return {
      handled: response !== null,
      response
    };
  }
}