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

    expect(cases[0]?.status).toBe("revoked");
    expect(cases[0]?.revokedAt?.toISOString()).toBe("2020-01-01T00:00:10.000Z");
    expect(persisted.status).toBe("revoked");
    expect(persisted.revokedAt?.toISOString()).toBe("2020-01-01T00:00:10.000Z");
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
