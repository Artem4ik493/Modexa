import { randomUUID } from "node:crypto";

import type { AdapterAction } from "../adapters/actions.js";
import type { AccessControlService } from "../access/service.js";
import type { Permission } from "../access/types.js";
import type { UserId } from "../identity/types.js";
import type { CommunityId } from "../communities/types.js";
import type { AuditService } from "../audit/service.js";
import type {
  CreateModerationCaseInput,
  ModerationActionType,
  ModerationCase,
  ModerationResult,
  WarningPolicy
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
    private readonly store?: ModerationCaseStore,
    private readonly auditService?: AuditService,
    private readonly warningPolicy: WarningPolicy = {
      threshold: 3,
      punishment: { action: "mute", durationSeconds: 600 }
    }
  ) {
    if (!Number.isSafeInteger(warningPolicy.threshold) || warningPolicy.threshold < 1) {
      throw new Error("Warning threshold must be a positive whole number");
    }
    if (!Number.isSafeInteger(warningPolicy.punishment.durationSeconds) || warningPolicy.punishment.durationSeconds <= 0) {
      throw new Error("Warning punishment duration must be a positive whole number of seconds");
    }
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
        new Date((item.appliedAt ?? item.createdAt).getTime() + item.durationSeconds * 1000);

      if (expiresAt.getTime() <= now.getTime()) {
        item.status = "expired";
        item.expiredAt = expiresAt;
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

    if (input.actorUserId === input.targetUserId) {
      throw new Error("You cannot moderate yourself");
    }

    if (
      this.accessControlService &&
      !this.accessControlService.canModerateUser(
        input.actorUserId,
        input.targetUserId,
        input.communityId
      )
    ) {
      throw new Error("Moderation target must have a lower Modexa role than the actor");
    }

    if (
      !input.actorUserId?.trim() ||
      !input.targetUserId?.trim() ||
      !input.communityId?.trim() ||
      !input.communityExternalId?.trim() ||
      !input.userExternalId?.trim()
    ) {
      throw new Error("Moderation requires actor, target, community, and platform identity IDs");
    }

    if (
      input.durationSeconds !== undefined &&
      input.action !== "mute"
    ) {
      throw new Error("Duration is only supported for mute actions");
    }

    if (
      input.durationSeconds !== undefined &&
      (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds <= 0)
    ) {
      throw new Error("Moderation duration must be greater than zero");
    }

    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) {
      throw new Error("Moderation creation date is invalid");
    }

    let effectiveDurationSeconds = input.durationSeconds;
    let supersedesCaseId: string | undefined;

    if (input.action === "mute" && input.durationSeconds !== undefined) {
      const existingMute = [...this.cases.values()]
        .filter((item) =>
          item.action === "mute" &&
          item.status === "active" &&
          item.communityId === input.communityId &&
          item.targetUserId === input.targetUserId &&
          item.platform === input.platform
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      if (existingMute) {
        if (existingMute.durationSeconds === undefined) {
          throw new Error("An indefinite mute is already active; remove it before applying another mute");
        }

        const existingExpiry = (existingMute.appliedAt ?? existingMute.createdAt).getTime() + existingMute.durationSeconds * 1000;
        const remainingSeconds = Math.max(0, Math.ceil((existingExpiry - now.getTime()) / 1000));
        effectiveDurationSeconds = remainingSeconds + input.durationSeconds;
        supersedesCaseId = existingMute.id;
      }
    }

    const reason = input.reason?.trim();
    if (reason && reason.length > 1000) {
      throw new Error("Moderation reason must not exceed 1000 characters");
    }

    const moderationCase: ModerationCase = {
      id: `mod_${randomUUID()}`,
      action: input.action,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      communityId: input.communityId,
      platform: input.platform,
      communityExternalId: input.communityExternalId,
      userExternalId: input.userExternalId,
      ...(effectiveDurationSeconds !== undefined ? { durationSeconds: effectiveDurationSeconds } : {}),
      ...(reason ? { reason } : {}),
      ...(supersedesCaseId ? { supersedesCaseId } : {}),
      status: "pending",
      createdAt: now
    };

    this.cases.set(moderationCase.id, moderationCase);
    this.store?.upsertModerationCase(moderationCase);
    this.auditService?.record({
      communityId: moderationCase.communityId,
      action: this.toAuditAction(moderationCase.action),
      actorUserId: moderationCase.actorUserId,
      targetUserId: moderationCase.targetUserId,
      reason: moderationCase.reason,
      metadata: {
        platform: moderationCase.platform,
        communityExternalId: moderationCase.communityExternalId,
        targetExternalId: moderationCase.userExternalId,
        moderationCaseId: moderationCase.id,
        durationSeconds: moderationCase.durationSeconds,
        caseStatus: moderationCase.status,
        result: "case_created"
      }
    });

    return {
      case: moderationCase,
      adapterAction: this.toAdapterAction(moderationCase)
    };
  }

  markApplied(caseId: string, now = new Date()): ModerationCase {
    const item = this.cases.get(caseId);
    if (!item) throw new Error(`Moderation case "${caseId}" does not exist`);
    if (item.status !== "pending") {
      throw new Error(`Moderation case "${caseId}" is not pending`);
    }
    if (!Number.isFinite(now.getTime())) {
      throw new Error("Moderation application date is invalid");
    }

    item.status = "active";
    item.appliedAt = now;
    this.cases.set(item.id, item);
    this.store?.upsertModerationCase(item);

    if (item.supersedesCaseId) {
      const previous = this.cases.get(item.supersedesCaseId);
      if (previous?.status === "active") {
        previous.status = "revoked";
        previous.revokedAt = now;
        this.cases.set(previous.id, previous);
        this.store?.upsertModerationCase(previous);
      }
    }

    return item;
  }

  markFailed(caseId: string, failureReason: string, now = new Date()): ModerationCase {
    const item = this.cases.get(caseId);
    if (!item) throw new Error(`Moderation case "${caseId}" does not exist`);
    if (item.status !== "pending") {
      throw new Error(`Moderation case "${caseId}" is not pending`);
    }
    item.status = "failed";
    item.failedAt = now;
    item.failureReason = failureReason.slice(0, 1000);
    this.cases.set(item.id, item);
    this.store?.upsertModerationCase(item);
    return item;
  }

  reconcileMuteWithPlatform(
    caseId: string,
    state: { isMuted: boolean; mutedUntil?: Date },
    now = new Date()
  ): ModerationCase {
    const item = this.cases.get(caseId);
    if (!item) throw new Error(`Moderation case "${caseId}" does not exist`);
    if (item.action !== "mute" || item.status !== "active") {
      throw new Error(`Moderation case "${caseId}" is not an active mute`);
    }
    if (!Number.isFinite(now.getTime())) {
      throw new Error("Moderation reconciliation date is invalid");
    }

    const appliedAt = item.appliedAt ?? item.createdAt;
    const expectedExpiry = item.durationSeconds === undefined
      ? undefined
      : appliedAt.getTime() + item.durationSeconds * 1000;

    if (!state.isMuted) {
      if (expectedExpiry !== undefined && expectedExpiry <= now.getTime()) {
        item.status = "expired";
        item.expiredAt = new Date(expectedExpiry);
      } else {
        item.status = "revoked";
        item.revokedAt = now;
      }
      this.cases.set(item.id, item);
      this.store?.upsertModerationCase(item);
      return item;
    }

    if (state.mutedUntil && Number.isFinite(state.mutedUntil.getTime())) {
      const durationSeconds = Math.max(
        1,
        Math.ceil((state.mutedUntil.getTime() - appliedAt.getTime()) / 1000)
      );
      item.durationSeconds = durationSeconds;
      this.cases.set(item.id, item);
      this.store?.upsertModerationCase(item);
    }

    return item;
  }

  getWarningPolicy(): WarningPolicy {
    return {
      threshold: this.warningPolicy.threshold,
      punishment: { ...this.warningPolicy.punishment }
    };
  }

  getActiveWarningCount(communityId: CommunityId, targetUserId: UserId): number {
    return this.getCases(communityId).filter((item) =>
      item.action === "warn" &&
      item.targetUserId === targetUserId &&
      item.status === "active"
    ).length;
  }

  clearActiveWarnings(actorUserId: UserId, communityId: CommunityId, targetUserId: UserId, now = new Date()): number {
    const warnings = this.getCases(communityId).filter((item) =>
      item.action === "warn" &&
      item.targetUserId === targetUserId &&
      item.status === "active"
    );
    for (const warning of warnings) {
      this.revokeCase(actorUserId, warning.id, now);
    }
    return warnings.length;
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

  assertCanRevokeCase(actorUserId: UserId, caseId: string): ModerationCase {
    const item = this.getCase(caseId);
    if (!item) throw new Error(`Moderation case "${caseId}" does not exist`);
    if (item.status !== "active") {
      throw new Error(`Moderation case "${caseId}" is not active`);
    }

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
    if (
      this.accessControlService &&
      !this.accessControlService.canModerateUser(
        actorUserId,
        item.targetUserId,
        item.communityId
      )
    ) {
      throw new Error("Moderation target must have a lower Modexa role than the actor");
    }
    return item;
  }

  revokeCase(actorUserId: UserId, caseId: string, now = new Date()): ModerationCase {
    const item = this.getCase(caseId);
    if (!item) throw new Error(`Moderation case "${caseId}" does not exist`);

    if (item.status !== "active") {
      throw new Error(`Moderation case "${caseId}" is not active`);
    }

    if (!Number.isFinite(now.getTime())) {
      throw new Error("Moderation revocation date is invalid");
    }

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
    if (
      this.accessControlService &&
      !this.accessControlService.canModerateUser(
        actorUserId,
        item.targetUserId,
        item.communityId
      )
    ) {
      throw new Error("Moderation target must have a lower Modexa role than the actor");
    }

    item.status = "revoked";
    item.revokedAt = now;
    this.cases.set(item.id, item);
    this.store?.upsertModerationCase(item);
    this.auditService?.record({
      communityId: item.communityId,
      action: "moderation.case.revoke",
      actorUserId,
      targetUserId: item.targetUserId,
      reason: item.reason,
      metadata: {
        platform: item.platform,
        communityExternalId: item.communityExternalId,
        targetExternalId: item.userExternalId,
        moderationCaseId: item.id,
        result: "case_revoked"
      }
    });
    return item;
  }

  private toAuditAction(action: ModerationActionType): "member.warn" | "member.mute" | "member.kick" | "member.ban" {
    switch (action) {
      case "warn": return "member.warn";
      case "mute": return "member.mute";
      case "kick": return "member.kick";
      case "ban": return "member.ban";
     }
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
