import type { Channel } from "../channels/types.js";
import type { Community } from "../communities/types.js";
import type { Locale } from "../i18n/locale.js";
import type { User } from "../identity/types.js";
import type { Platform } from "../types.js";

export type ExecutionContextType =
  | "dm"
  | "community";

export type ExecutionCapability =
  | "commands"
  | "account.manage"
  | "identity.link"
  | "community.view"
  | "community.manage"
  | "member.view"
  | "member.manage"
  | "moderation"
  | "bridge"
  | "automations"
  | "billing";

export interface ExecutionContext {
  type: ExecutionContextType;

  platform: Platform;

  correlationId: string;

  user: User;

  community?: Community;

  channel?: Channel;

  /**
   * Language for user-facing text. Defaults to the
   * Modexa default locale when not set.
   */
  locale?: Locale;

  capabilities: ExecutionCapability[];
}

export interface CreateExecutionContextInput {
  platform: Platform;

  correlationId: string;

  user: User;

  community?: Community;

  channel?: Channel;

  locale?: Locale;
}