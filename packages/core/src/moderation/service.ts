import { randomUUID } from "node:crypto";

import type { AdapterAction } from "../adapters/actions.js";
import type { AccessControlService } from "../access/service.js";
import type { Permission } from "../access/types.js";
import type { UserId } from "../identity/types.js";
import type { CommunityId } from "../communities/types.js";
import type {
  CreateModerationCaseInput,
  ModerationActionType,
  ModerationCase,
  ModerationResult
} from "./types.js";

export interface ModerationCaseStore {
  upsertModerationCase(item: ModerationCase): void;
  getModerationCase(caseId: string): ModerationCase | undefined;
  getModerationCases(communityId: string): ModerationCase[];
  getAllModerationCases(): ModerationCase[];
}

const ACTION_PERMISSIONS: Record<ModerationActionType, Permission> = {
  warn: "moderation.warn",
  mute: "moderation.mute",
  kick: "moderation.kick",
  ban: "moderation.ban"
};

export class ModerationService {
  private readonly cases = new Map<string, ModerationCase>();

  constructor(
    private readonly accessControlService?: AccessControlService,
    private readonly store?: ModerationCaseStore
  ) {
    for (const item of store?.getAllModerationCases() ?? []) {
      this.cases.set(item.id, item);
    }

    // Reconcile persisted timed mutes on startup. Platform timeouts expire
    // independently, so the Modexa case must not remain "active" forever.
    this.expireTimedMutes(new Date());
  }

  private expireTimedMutes(now: Date): void {
    for (const item of this.cases.values()) {
      if (
        item.action !== "mute" ||
        item.status !== "active" ||
        item.durationSeconds === undefined
      ) {
        continue;
      }

      const expiresAt =
        new Date(item.createdAt.getTime() + item.durationSeconds * 1000);

      if (expiresAt.getTime() <= now.getTime()) {
        item.status = "revoked";
        item.revokedAt = expiresAt;
        this.cases.set(item.id, item);
        this.store?.upsertModerationCase(item);
      }
    }
  }

  createCase(input: CreateModerationCaseInput): ModerationResult {
    const permission = ACTION_PERMISSIONS[input.action];

    if (
      this.accessControlService &&
      !this.accessControlService.hasCommunityPermission(
        input.actorUserId,
        input.communityId,
        permission
      )
    ) {
      throw new Error(`Missing permission "${permission}"`);
    }

    if (
      input.durationSeconds !== undefined &&
      (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0)
    ) {
      throw new Error("Moderation duration must be greater than zero");
    }

    const now = input.now ?? new Date();
    const moderationCase: ModerationCase = {
      id: `mod_${randomUUID()}`,
      action: input.action,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      communityId: input.communityId,
      platform: input.platform,
      communityExternalId: input.communityExternalId,
      userExternalId: input.userExternalId,
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      status: "active",
      createdAt: now
    };

    this.cases.set(moderationCase.id, moderationCase);
    this.store?.upsertModerationCase(moderationCase);

    return {
      case: moderationCase,
      adapterAction: this.toAdapterAction(moderationCase)
    };
  }

  getCase(caseId: string): ModerationCase | undefined {
    this.expireTimedMutes(new Date());
    return this.cases.get(caseId) ?? this.store?.getModerationCase(caseId);
  }

  getCases(communityId: CommunityId): ModerationCase[] {
    this.expireTimedMutes(new Date());
    return [...this.cases.values()]
      .filter((item) => item.communityId === communityId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  revokeCase(actorUserId: UserId, caseId: string, now = new Date()): ModerationCase {
    const item = this.getCase(caseId);
    if (!item) throw new Error(`Moderation case "${caseId}" does not exist`);

    const permission = ACTION_PERMISSIONS[item.action];
    if (
      this.accessControlService &&
      !this.accessControlService.hasCommunityPermission(
        actorUserId,
        item.communityId,
        permission
      )
    ) {
      throw new Error(`Missing permission "${permission}"`);
    }

    item.status = "revoked";
    item.revokedAt = now;
    this.cases.set(item.id, item);
    this.store?.upsertModerationCase(item);
    return item;
  }

  toAdapterAction(item: ModerationCase): AdapterAction {
    const base = {
      platform: item.platform,
      communityExternalId: item.communityExternalId,
      userExternalId: item.userExternalId,
      ...(item.reason ? { reason: item.reason } : {})
    };

    switch (item.action) {
      case "warn": return { ...base, type: "member.warn" };
      case "mute":
        return {
          ...base,
          type: "member.mute",
          ...(item.durationSeconds !== undefined ? { durationSeconds: item.durationSeconds } : {})
        };
      case "kick": return { ...base, type: "member.kick" };
      case "ban": return { ...base, type: "member.ban" };
    }
  }
}
