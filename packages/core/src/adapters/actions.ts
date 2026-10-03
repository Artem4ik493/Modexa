import type { Platform } from "../types.js";

export interface SendMessageAction {
  type: "message.send";
  platform: Platform;
  channelExternalId: string;
  content: string;

  /**
   * External id of the interaction or command invocation
   * this message answers. Adapters that must reply through
   * the original interaction (Discord slash commands) use
   * it. Other adapters ignore it.
   */
  replyToExternalId?: string;

  metadata?: Record<string, unknown>;
}

export interface EditMessageAction {
  type: "message.edit";
  platform: Platform;
  channelExternalId: string;
  messageExternalId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface DeleteMessageAction {
  type: "message.delete";
  platform: Platform;
  channelExternalId: string;
  messageExternalId: string;
  metadata?: Record<string, unknown>;
}

export interface WarnMemberAction {
  type: "member.warn";
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface MuteMemberAction {
  type: "member.mute";
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  durationSeconds?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface KickMemberAction {
  type: "member.kick";
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ClearMessagesAction {
  type: "channel.clear";
  platform: Platform;
  channelExternalId: string;
  count: number;
  metadata?: Record<string, unknown>;
}

export interface UnmuteMemberAction {
  type: "member.unmute";
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  metadata?: Record<string, unknown>;
}

export interface UnbanMemberAction {
  type: "member.unban";
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  metadata?: Record<string, unknown>;
}

export interface BanMemberAction {
  type: "member.ban";
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export type AdapterAction =
  | SendMessageAction
  | EditMessageAction
  | DeleteMessageAction
  | WarnMemberAction
  | MuteMemberAction
  | KickMemberAction
  | BanMemberAction
  | ClearMessagesAction
  | UnmuteMemberAction
  | UnbanMemberAction;