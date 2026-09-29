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
  | "interaction.created";

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

export type AdapterEvent =
  | AdapterMessageCreatedEvent
  | AdapterMessageUpdatedEvent
  | AdapterMessageDeletedEvent
  | AdapterMemberJoinedEvent
  | AdapterMemberLeftEvent
  | AdapterMemberBannedEvent
  | AdapterInteractionCreatedEvent;