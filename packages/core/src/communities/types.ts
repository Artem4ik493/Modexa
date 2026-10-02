export type CommunityId = string;
export type CommunityIdentityId = string;

export type CommunityPlatform =
  | "telegram"
  | "discord";

export type CommunityMode =
  | "public"
  | "private";

export interface Community {
  id: CommunityId;
  name: string;
  mode?: CommunityMode;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityIdentity {
  id: CommunityIdentityId;
  communityId: CommunityId;
  platform: CommunityPlatform;
  externalId: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}