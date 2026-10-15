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
  | "pending"
  | "active"
  | "failed"
  | "revoked"
  | "expired";

export interface WarningPolicy {
  /** Number of active warnings required before applying the configured punishment. */
  threshold: number;
  punishment: {
    action: "mute";
    durationSeconds: number;
  };
}

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
  appliedAt?: Date;
  failedAt?: Date;
  revokedAt?: Date;
  expiredAt?: Date;
  failureReason?: string;
  supersedesCaseId?: string;
}

export interface ModerationResult {
  case: ModerationCase;
  adapterAction: AdapterAction;
}