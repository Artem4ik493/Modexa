import { describe, expect, it } from "vitest";

import {
  AccessControlService
} from "../src/access/service.js";

import {
  MODEXA_OWNER_ROLE,
  MODEXA_OWNER_ROLE_ID
} from "../src/access/built-in.js";

describe("AccessControlService", () => {
  it("registers and assigns the MODEXA_OWNER role", () => {
    const service = new AccessControlService();

    service.registerSystemRole(
      MODEXA_OWNER_ROLE
    );

    service.assignSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    expect(
      service.hasSystemRole(
        "user-1",
        MODEXA_OWNER_ROLE_ID
      )
    ).toBe(true);
  });

  it("gives MODEXA_OWNER system permissions", () => {
    const service = new AccessControlService();

    service.registerSystemRole(
      MODEXA_OWNER_ROLE
    );

    service.assignSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    expect(
      service.hasPermission(
        "user-1",
        "system.users.manage"
      )
    ).toBe(true);

    expect(
      service.hasPermission(
        "user-1",
        "system.subscriptions.manage"
      )
    ).toBe(true);

    expect(
      service.hasPermission(
        "user-1",
        "system.backup.restore"
      )
    ).toBe(true);
  });

  it("does not give permissions to an unassigned user", () => {
    const service = new AccessControlService();

    service.registerSystemRole(
      MODEXA_OWNER_ROLE
    );

    expect(
      service.hasPermission(
        "user-1",
        "system.users.manage"
      )
    ).toBe(false);
  });

  it("does not duplicate a system role assignment", () => {
    const service = new AccessControlService();

    service.registerSystemRole(
      MODEXA_OWNER_ROLE
    );

    service.assignSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    service.assignSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    expect(
      service.hasSystemRole(
        "user-1",
        MODEXA_OWNER_ROLE_ID
      )
    ).toBe(true);
  });

  it("registers and assigns a community role", () => {
    const service = new AccessControlService();

    service.registerCommunityRole({
      id: "community-admin",
      communityId: "community-1",
      name: "ADMIN",
      permissions: [
        "community.manage",
        "member.manage",
        "moderation.warn",
        "moderation.mute",
        "moderation.kick",
        "moderation.ban"
      ]
    });

    service.assignCommunityRole(
      "user-1",
      "community-admin"
    );

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "moderation.ban"
      )
    ).toBe(true);
  });

  it("does not apply a community role to another community", () => {
    const service = new AccessControlService();

    service.registerCommunityRole({
      id: "community-admin",
      communityId: "community-1",
      name: "ADMIN",
      permissions: [
        "community.manage"
      ]
    });

    service.assignCommunityRole(
      "user-1",
      "community-admin"
    );

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-2",
        "community.manage"
      )
    ).toBe(false);
  });

  it("does not give a community permission to an unassigned user", () => {
    const service = new AccessControlService();

    service.registerCommunityRole({
      id: "community-admin",
      communityId: "community-1",
      name: "ADMIN",
      permissions: [
        "community.manage"
      ]
    });

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "community.manage"
      )
    ).toBe(false);
  });

  it("rejects assigning an unknown system role", () => {
    const service = new AccessControlService();

    expect(() => {
      service.assignSystemRole(
        "user-1",
        "unknown-role"
      );
    }).toThrow(
      'System role "unknown-role" does not exist'
    );
  });

  it("rejects assigning an unknown community role", () => {
    const service = new AccessControlService();

    expect(() => {
      service.assignCommunityRole(
        "user-1",
        "unknown-role"
      );
    }).toThrow(
      'Community role "unknown-role" does not exist'
    );
  });
});