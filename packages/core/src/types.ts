import type { Community } from "./communities/types.js";
import type { User } from "./identity/types.js";

export type Platform = "telegram" | "discord";

export type EntityId = string;

export interface CommandContext {
  platform: Platform;
  user: User;
  community?: Community;
  args: string[];
  rawText: string;
}

export interface CommandResponse {
  content: string;
}

export type CommandHandler = (
  context: CommandContext
) => CommandResponse | Promise<CommandResponse>;

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  description?: string;
  handler: CommandHandler;
}