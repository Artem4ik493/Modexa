import { describe, expect, it } from "vitest";

import {
  AccessControlService
} from "../src/access/service.js";

import {
  MODEXA_OWNER_ROLE,
  MODEXA_OWNER_ROLE_ID
} from "../src/access/built-in.js";

import {
  createBuiltinCommunityRoles
} from "../src/access/community-roles.js";

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
      service.getUserSystemRoles("user-1")
    ).toHaveLength(1);
  });

  it("can revoke a system role", () => {
    const service = new AccessControlService();

    service.registerSystemRole(
      MODEXA_OWNER_ROLE
    );

    service.assignSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    service.revokeSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    expect(
      service.hasSystemRole(
        "user-1",
        MODEXA_OWNER_ROLE_ID
      )
    ).toBe(false);
  });

  it("creates built-in community roles", () => {
    const roles =
      createBuiltinCommunityRoles(
        "community-1"
      );

    expect(roles).toHaveLength(4);

    expect(
      roles.map((role) => role.name)
    ).toEqual([
      "ADMIN",
      "MODERATOR",
      "MEMBER"
    ]);
  });

  it("gives an ADMIN community permissions", () => {
    const service = new AccessControlService();

    const roles =
      createBuiltinCommunityRoles(
        "community-1"
      );

    for (const role of roles) {
      service.registerCommunityRole(role);
    }

    service.assignCommunityRole(
      "user-1",
      "community-1:admin"
    );

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "moderation.ban"
      )
    ).toBe(true);

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "bridge.manage"
      )
    ).toBe(true);
  });

  it("gives a MODERATOR moderation permissions", () => {
    const service = new AccessControlService();

    const roles =
      createBuiltinCommunityRoles(
        "community-1"
      );

    for (const role of roles) {
      service.registerCommunityRole(role);
    }

    service.assignCommunityRole(
      "user-1",
      "community-1:moderator"
    );

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "moderation.warn"
      )
    ).toBe(true);

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "moderation.ban"
      )
    ).toBe(true);

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "bridge.manage"
      )
    ).toBe(false);
  });

  it("gives a MEMBER only basic permissions", () => {
    const service = new AccessControlService();

    const roles =
      createBuiltinCommunityRoles(
        "community-1"
      );

    for (const role of roles) {
      service.registerCommunityRole(role);
    }

    service.assignCommunityRole(
      "user-1",
      "community-1:member"
    );

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "community.view"
      )
    ).toBe(true);

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "commands.use"
      )
    ).toBe(true);

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-1",
        "moderation.ban"
      )
    ).toBe(false);
  });

  it("does not apply a community role to another community", () => {
    const service = new AccessControlService();

    const roles =
      createBuiltinCommunityRoles(
        "community-1"
      );

    for (const role of roles) {
      service.registerCommunityRole(role);
    }

    service.assignCommunityRole(
      "user-1",
      "community-1:admin"
    );

    expect(
      service.hasCommunityPermission(
        "user-1",
        "community-2",
        "community.manage"
      )
    ).toBe(false);
  });

  it("can revoke a community role", () => {
    const service = new AccessControlService();

    const roles =
      createBuiltinCommunityRoles(
        "community-1"
      );

    for (const role of roles) {
      service.registerCommunityRole(role);
    }

    service.assignCommunityRole(
      "user-1",
      "community-1:admin"
    );

    service.revokeCommunityRole(
      "user-1",
      "community-1:admin"
    );

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