import type { Permission } from "./access/types.js";
import type { Channel } from "./channels/types.js";
import type { Community } from "./communities/types.js";
import type {
  ExecutionCapability,
  ExecutionContext
} from "./contexts/types.js";
import type { MessageKey } from "./i18n/messages.js";
import type { User } from "./identity/types.js";
import type { InteractionResponse } from "./interactions/types.js";

export type Platform =
  | "telegram"
  | "discord";

export type EntityId = string;

export interface CommandContext {
  platform: Platform;

  user: User;

  community?: Community;

  channel?: Channel;

  execution: ExecutionContext;

  args: string[];

  rawText: string;
}

export interface CommandResponse
  extends InteractionResponse {
  content?: string;
}

export type CommandHandler = (
  context: CommandContext
) =>
  | CommandResponse
  | Promise<CommandResponse>;

export interface CommandDefinition {
  name: string;

  aliases?: string[];

  description?: string;

  /**
   * Translatable description. Takes priority over
   * `description` when the command list is rendered.
   */
  descriptionKey?: MessageKey;

  requiredCapabilities?: ExecutionCapability[];

  /** Exact community permissions checked centrally by CommandService. */
  requiredPermissions?: Permission[] | ((context: CommandContext) => Permission[]);

  handler: CommandHandler;
}