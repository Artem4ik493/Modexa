import type { Channel } from "./channels/types.js";
import type { Community } from "./communities/types.js";
import type { ExecutionContext } from "./contexts/types.js";
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
  content: string;
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

  handler: CommandHandler;
}