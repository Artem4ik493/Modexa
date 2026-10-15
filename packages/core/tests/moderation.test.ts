import { describe, expect, it } from "vitest";

import {
  AccessControlService,
  COMMUNITY_ROLE_NAMES,
  createBuiltinCommunityRoles
} from "../src/access/index.js";
import { ModerationService } from "../src/moderation/index.js";

describe("ModerationService", () => {
  function createAccess() {
    const access = new AccessControlService();
    const roles = createBuiltinCommunityRoles("community-1");

    for (const role of roles) {
      access.registerCommunityRole(role);
    }

    access.assignCommunityRole(
      "user-admin",
      `community-1:${COMMUNITY_ROLE_NAMES.ADMIN.toLowerCase()}`
    );

    access.assignCommunityRole(
      "user-mod",
      `community-1:${COMMUNITY_ROLE_NAMES.MODERATOR.toLowerCase()}`
    );

    return access;
  }

  it("creates warn, mute, kick and ban cases with platform actions", () => {
    const service = new ModerationService(createAccess());

    for (const action of [
      "warn",
      "mute",
      "kick",
      "ban"
    ] as const) {
      const result = service.createCase({
        action,
        actorUserId: "user-mod",
        targetUserId: "user-target",
        communityId: "community-1",
        platform: "discord",
        communityExternalId: "guild-1",
        userExternalId: "user-1",
        ...(action === "mute"
          ? { durationSeconds: 300 }
          : {}),
        reason: "test reason"
      });

      expect(result.case.action).toBe(action);
      expect(result.case.reason).toBe("test reason");
      expect(result.adapterAction.type).toBe(
        `member.${action}`
      );
    }
  });

  it("enforces the action-specific permission", () => {
    const service = new ModerationService(createAccess());

    expect(() =>
      service.createCase({
        action: "ban",
        actorUserId: "user-member",
        targetUserId: "user-target",
        communityId: "community-1",
        platform: "discord",
        communityExternalId: "guild-1",
        userExternalId: "user-1"
      })
    ).toThrow('Missing permission "moderation.ban"');
  });

  it("validates mute duration", () => {
    const service = new ModerationService(createAccess());

    expect(() =>
      service.createCase({
        action: "mute",
        actorUserId: "user-mod",
        targetUserId: "user-target",
        communityId: "community-1",
        platform: "discord",
        communityExternalId: "guild-1",
        userExternalId: "user-1",
        durationSeconds: 0
      })
    ).toThrow("Moderation duration must be greater than zero");
  });


  it("expires persisted timed mutes and saves the cleanup", () => {
    const seededService = new ModerationService(createAccess());
    const seeded = seededService.createCase({
      action: "mute",
      actorUserId: "user-mod",
      targetUserId: "user-target",
      communityId: "community-1",
      platform: "telegram",
      communityExternalId: "-100123",
      userExternalId: "123",
      durationSeconds: 10,
      now: new Date("2020-01-01T00:00:00.000Z")
    }).case;

    let persisted = seeded;
    const store = {
      upsertModerationCase(item: typeof seeded) {
        persisted = { ...item };
      },
      getModerationCase(caseId: string) {
        return caseId === persisted.id ? persisted : undefined;
      },
      getModerationCases(communityId: string) {
        return persisted.communityId === communityId ? [persisted] : [];
      },
      getAllModerationCases() {
        return [persisted];
      }
    };

    const restored = new ModerationService(createAccess(), store);
    restored.markApplied(seeded.id, new Date("2020-01-01T00:00:00.000Z"));
    const cases = restored.getCases("community-1");

    expect(cases[0]?.status).toBe("expired");
    expect(cases[0]?.expiredAt?.toISOString()).toBe("2020-01-01T00:00:10.000Z");
    expect(persisted.status).toBe("expired");
    expect(persisted.expiredAt?.toISOString()).toBe("2020-01-01T00:00:10.000Z");
  });

  it("enforces strict Modexa role hierarchy and blocks self-moderation", () => {
    const access = createAccess();
    access.assignCommunityRole(
      "user-target",
      `community-1:${COMMUNITY_ROLE_NAMES.ADMIN.toLowerCase()}`
    );
    const service = new ModerationService(access);

    expect(() => service.createCase({
      action: "warn",
      actorUserId: "user-mod",
      targetUserId: "user-target",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-1"
    })).toThrow("Moderation target must have a lower Modexa role than the actor");

    expect(() => service.createCase({
      action: "warn",
      actorUserId: "user-mod",
      targetUserId: "user-mod",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-mod"
    })).toThrow("You cannot moderate yourself");
  });

  it("extends a repeated timed mute from the existing expiry", () => {
    const service = new ModerationService(createAccess());
    const first = service.createCase({
      action: "mute",
      actorUserId: "user-mod",
      targetUserId: "user-target",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-1",
      durationSeconds: 600,
      now: new Date("2026-10-15T10:00:00.000Z")
    });
    service.markApplied(first.case.id, new Date("2026-10-15T10:00:00.000Z"));

    const second = service.createCase({
      action: "mute",
      actorUserId: "user-mod",
      targetUserId: "user-target",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-1",
      durationSeconds: 300,
      now: new Date("2026-10-15T10:05:00.000Z")
    });

    expect(second.case.durationSeconds).toBe(600);
    expect(second.case.supersedesCaseId).toBe(first.case.id);
    service.markApplied(second.case.id, new Date("2026-10-15T10:05:00.000Z"));
    expect(service.getCase(first.case.id)?.status).toBe("revoked");
    expect(service.getCase(second.case.id)?.status).toBe("active");
  });

  it("reconciles active mutes with the platform's actual timeout", () => {
    const service = new ModerationService(createAccess());
    const result = service.createCase({
      action: "mute",
      actorUserId: "user-mod",
      targetUserId: "user-target",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-1",
      durationSeconds: 600,
      now: new Date("2026-10-15T10:00:00.000Z")
    });
    service.markApplied(result.case.id, new Date("2026-10-15T10:00:00.000Z"));

    const removed = service.reconcileMuteWithPlatform(
      result.case.id,
      { isMuted: false },
      new Date("2026-10-15T10:01:00.000Z")
    );
    expect(removed.status).toBe("revoked");
    expect(removed.revokedAt?.toISOString()).toBe("2026-10-15T10:01:00.000Z");
  });

  it("exposes the configurable warning threshold and punishment", () => {
    const service = new ModerationService(createAccess());
    expect(service.getWarningPolicy()).toEqual({
      threshold: 3,
      punishment: { action: "mute", durationSeconds: 600 }
    });
  });

  it("can revoke a moderation case", () => {
    const service = new ModerationService(createAccess());

    const result = service.createCase({
      action: "warn",
      actorUserId: "user-mod",
      targetUserId: "user-target",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-1"
    });

    service.markApplied(result.case.id);
    const revoked = service.revokeCase(
      "user-mod",
      result.case.id
    );

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });
});
