import type { IdentityPlatform } from "../identity/types.js";

export type BridgeEndpointId = string;
export type BridgeLinkId = string;
export type BridgeLinkRequestId = string;

export interface BridgeEndpoint {
  id: BridgeEndpointId;
  platform: IdentityPlatform;
  communityExternalId: string;
  communityName: string;
  channelExternalId: string;
  channelName: string;
  communityId?: string;
  channelId?: string;
  updatedAt: Date;
}

export type BridgeLinkRequestStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled";

export interface BridgeLinkRequest {
  id: BridgeLinkRequestId;
  sourceEndpointId: BridgeEndpointId;
  targetEndpointId: BridgeEndpointId;
  requestedByUserId: string;
  status: BridgeLinkRequestStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BridgeLink {
  id: BridgeLinkId;
  sourceEndpointId: BridgeEndpointId;
  targetEndpointId: BridgeEndpointId;
  createdAt: Date;
  updatedAt: Date;
}
