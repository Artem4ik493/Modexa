import type {
  CommunityId,
  CommunityPlatform
} from "../communities/types.js";

export type ChannelId = string;
export type ChannelIdentityId = string;

export type ChannelType =
  | "telegram_chat"
  | "telegram_topic"
  | "discord_category"
  | "discord_text"
  | "discord_voice"
  | "discord_forum"
  | "discord_thread";

export interface Channel {
  id: ChannelId;
  communityId: CommunityId;
  externalId?: string;
  parentId?: ChannelId;
  name: string;
  type: ChannelType;
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelIdentity {
  id: ChannelIdentityId;
  channelId: ChannelId;
  platform: CommunityPlatform;
  externalId: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}