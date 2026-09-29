import type { CommunityId } from "../communities/types.js";

export type PlanId = string;
export type SubscriptionId = string;

export type FeatureKey =
  | "basic_commands"
  | "basic_moderation"
  | "advanced_moderation"
  | "automod"
  | "bridge"
  | "automations"
  | "analytics"
  | "backup";

export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "expired";

export interface FeatureEntitlement {
  feature: FeatureKey;
  enabled: boolean;
  limit?: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  entitlements: FeatureEntitlement[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: SubscriptionId;
  communityId: CommunityId;
  planId: PlanId;
  status: SubscriptionStatus;
  startsAt: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionFeatureOverride {
  subscriptionId: SubscriptionId;
  feature: FeatureKey;
  enabled: boolean;
  limit?: number;
}