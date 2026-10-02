import type {
  PlatformChannel,
  PlatformCommunity,
  PlatformUser
} from "./types.js";

export type AdapterEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "member.joined"
  | "member.left"
  | "member.banned"
  | "interaction.created"
  | "command.invoked";

export interface AdapterMessage {
  externalId: string;

  platform: PlatformUser["platform"];

  author: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;

  /**
   * External platform identifier where a response
   * should be sent.
   *
   * For Telegram this is the chat ID.
   * For Discord this will normally be a channel ID.
   */
  destinationExternalId: string;

  content: string;

  /** Author of the message being replied to, when present. */
  replyTo?: PlatformUser;

  createdAt: Date;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface AdapterMemberEvent {
  externalId: string;

  platform: PlatformUser["platform"];

  user: PlatformUser;

  community: PlatformCommunity;

  createdAt: Date;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface AdapterInteraction {
  externalId: string;

  platform: PlatformUser["platform"];

  user: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;

  /**
   * External platform identifier where the response
   * should be sent (Telegram chat ID, Discord channel ID).
   * Undefined when the platform cannot address a response.
   */
  destinationExternalId?: string;

  /**
   * External identifier of the message that contained
   * the pressed button or menu, so it can be edited.
   */
  messageExternalId?: string;

  /**
   * Compact Modexa interaction token extracted by the
   * adapter from the platform payload. Undefined when
   * the payload was not created by Modexa.
   */
  token?: string;

  createdAt: Date;

  metadata?: Record<
    string,
    unknown
  >;
}

/**
 * A command invoked through a platform-native mechanism
 * (Discord slash command) instead of a text message.
 */
export interface AdapterCommandInvocation {
  /**
   * Id of the invocation. Responses can reference it with
   * `replyToExternalId`.
   */
  externalId: string;

  platform: PlatformUser["platform"];

  user: PlatformUser;

  community?: PlatformCommunity;

  channel?: PlatformChannel;

  destinationExternalId: string;

  /**
   * Command name without the leading slash.
   */
  name: string;

  args: string[];

  createdAt: Date;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface AdapterMessageCreatedEvent {
  type: "message.created";

  message: AdapterMessage;
}

export interface AdapterMessageUpdatedEvent {
  type: "message.updated";

  message: AdapterMessage;
}

export interface AdapterMessageDeletedEvent {
  type: "message.deleted";

  message: AdapterMessage;
}

export interface AdapterMemberJoinedEvent {
  type: "member.joined";

  member: AdapterMemberEvent;
}

export interface AdapterMemberLeftEvent {
  type: "member.left";

  member: AdapterMemberEvent;
}

export interface AdapterMemberBannedEvent {
  type: "member.banned";

  member: AdapterMemberEvent;
}

export interface AdapterInteractionCreatedEvent {
  type: "interaction.created";

  interaction: AdapterInteraction;
}

export interface AdapterCommandInvokedEvent {
  type: "command.invoked";

  invocation: AdapterCommandInvocation;
}

export type AdapterEvent =
  | AdapterMessageCreatedEvent
  | AdapterMessageUpdatedEvent
  | AdapterMessageDeletedEvent
  | AdapterMemberJoinedEvent
  | AdapterMemberLeftEvent
  | AdapterMemberBannedEvent
  | AdapterInteractionCreatedEvent
  | AdapterCommandInvokedEvent;