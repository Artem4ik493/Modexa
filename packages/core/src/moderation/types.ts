import type { Platform } from "../types.js";
import type { UserId } from "../identity/types.js";
import type { CommunityId } from "../communities/types.js";
import type { AdapterAction } from "../adapters/actions.js";

export type ModerationActionType =
  | "warn"
  | "mute"
  | "kick"
  | "ban";

export type ModerationCaseStatus =
  | "active"
  | "revoked";

export interface CreateModerationCaseInput {
  action: ModerationActionType;
  actorUserId: UserId;
  targetUserId: UserId;
  communityId: CommunityId;
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  durationSeconds?: number;
  reason?: string;
  now?: Date;
}

export interface ModerationCase {
  id: string;
  action: ModerationActionType;
  actorUserId: UserId;
  targetUserId: UserId;
  communityId: CommunityId;
  platform: Platform;
  communityExternalId: string;
  userExternalId: string;
  durationSeconds?: number;
  reason?: string;
  status: ModerationCaseStatus;
  createdAt: Date;
  revokedAt?: Date;
}

export interface ModerationResult {
  case: ModerationCase;
  adapterAction: AdapterAction;
}
