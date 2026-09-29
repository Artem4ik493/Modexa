export type UserId = string;
export type ExternalIdentityId = string;
export type IdentityLinkSessionId = string;

export type IdentityPlatform =
  | "telegram"
  | "discord";

export interface User {
  id: UserId;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalIdentity {
  id: ExternalIdentityId;
  userId: UserId;
  platform: IdentityPlatform;
  externalId: string;
  username?: string;
  displayName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IdentityLinkSessionStatus =
  | "pending"
  | "completed"
  | "expired"
  | "cancelled";

export interface IdentityLinkSession {
  id: IdentityLinkSessionId;
  userId: UserId;
  sourcePlatform: IdentityPlatform;
  targetPlatform: IdentityPlatform;
  code: string;
  status: IdentityLinkSessionStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}