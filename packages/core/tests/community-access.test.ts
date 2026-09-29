import { describe, expect, it } from "vitest";

import {
  CommunityAccessService
} from "../src/access/community-access.js";

import {
  AccessControlService
} from "../src/access/service.js";

import {
  createBuiltinCommunityRoles
} from "../src/access/community-roles.js";

import {
  MembershipService
} from "../src/memberships/service.js";

describe("CommunityAccessService", () => {
  function createServices() {
    const membershipService =
      new MembershipService();

    const accessControlService =
      new AccessControlService();

    const communityId = "community-1";

    const roles =
      createBuiltinCommunityRoles(
        communityId
      );

    for (const role of roles) {
      accessControlService.registerCommunityRole(
        role
      );
    }

    const communityAccessService =
      new CommunityAccessService(
        membershipService,
        accessControlService
      );

    return {
      membershipService,
      accessControlService,
      communityAccessService,
      communityId
    };
  }

  it("allows an active member with the required role permission", () => {
    const {
      membershipService,
      accessControlService,
      communityAccessService,
      communityId
    } = createServices();

    membershipService.createMembership({
      userId: "user-1",
      communityId
    });

    accessControlService.assignCommunityRole(
      "user-1",
      `${communityId}:moderator`
    );

    expect(
      communityAccessService.can(
        "user-1",
        communityId,
        "moderation.warn"
      )
    ).toBe(true);
  });

  it("denies access to a user without membership", () => {
    const {
      accessControlService,
      communityAccessService,
      communityId
    } = createServices();

    accessControlService.assignCommunityRole(
      "user-1",
      `${communityId}:admin`
    );

    expect(
      communityAccessService.can(
        "user-1",
        communityId,
        "community.manage"
      )
    ).toBe(false);
  });

  it("denies access after a member leaves", () => {
    const {
      membershipService,
      accessControlService,
      communityAccessService,
      communityId
    } = createServices();

    const membership =
      membershipService.createMembership({
        userId: "user-1",
        communityId
      });

    accessControlService.assignCommunityRole(
      "user-1",
      `${communityId}:admin`
    );

    membershipService.leave(
      membership.id
    );

    expect(
      communityAccessService.can(
        "user-1",
        communityId,
        "community.manage"
      )
    ).toBe(false);
  });

  it("denies access to a banned member", () => {
    const {
      membershipService,
      accessControlService,
      communityAccessService,
      communityId
    } = createServices();

    const membership =
      membershipService.createMembership({
        userId: "user-1",
        communityId
      });

    accessControlService.assignCommunityRole(
      "user-1",
      `${communityId}:admin`
    );

    membershipService.ban(
      membership.id
    );

    expect(
      communityAccessService.can(
        "user-1",
        communityId,
        "community.manage"
      )
    ).toBe(false);
  });

  it("allows access again after reactivation", () => {
    const {
      membershipService,
      accessControlService,
      communityAccessService,
      communityId
    } = createServices();

    const membership =
      membershipService.createMembership({
        userId: "user-1",
        communityId
      });

    accessControlService.assignCommunityRole(
      "user-1",
      `${communityId}:admin`
    );

    membershipService.ban(
      membership.id
    );

    membershipService.reactivate(
      membership.id
    );

    expect(
      communityAccessService.can(
        "user-1",
        communityId,
        "community.manage"
      )
    ).toBe(true);
  });

  it("denies permissions from another community", () => {
    const {
      membershipService,
      accessControlService,
      communityAccessService
    } = createServices();

    membershipService.createMembership({
      userId: "user-1",
      communityId: "community-1"
    });

    accessControlService.assignCommunityRole(
      "user-1",
      "community-1:admin"
    );

    expect(
      communityAccessService.can(
        "user-1",
        "community-2",
        "community.manage"
      )
    ).toBe(false);
  });
});