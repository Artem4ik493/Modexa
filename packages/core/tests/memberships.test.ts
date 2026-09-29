import { describe, expect, it } from "vitest";
import { MembershipService } from "../src/memberships/service.js";

describe("MembershipService", () => {
  const now = new Date(
    "2026-01-01T12:00:00.000Z"
  );

  it("creates an active membership", () => {
    const service = new MembershipService();

    const membership =
      service.createMembership({
        userId: "user-1",
        communityId: "community-1",
        now
      });

    expect(membership.id).toBe(
      "membership-1"
    );

    expect(membership.userId).toBe(
      "user-1"
    );

    expect(membership.communityId).toBe(
      "community-1"
    );

    expect(membership.status).toBe(
      "active"
    );

    expect(membership.joinedAt).toBe(now);
    expect(membership.updatedAt).toBe(now);
  });

  it("finds a membership by user and community", () => {
    const service = new MembershipService();

    const created =
      service.createMembership({
        userId: "user-1",
        communityId: "community-1",
        now
      });

    const found = service.findMembership(
      "user-1",
      "community-1"
    );

    expect(found).toBe(created);
  });

  it("returns undefined for a missing membership", () => {
    const service = new MembershipService();

    expect(
      service.findMembership(
        "user-1",
        "community-1"
      )
    ).toBeUndefined();
  });

  it("does not allow duplicate memberships", () => {
    const service = new MembershipService();

    service.createMembership({
      userId: "user-1",
      communityId: "community-1",
      now
    });

    expect(() => {
      service.createMembership({
        userId: "user-1",
        communityId: "community-1",
        now
      });
    }).toThrow(
      'Membership already exists for user "user-1" in community "community-1"'
    );
  });

  it("checks whether a user is an active member", () => {
    const service = new MembershipService();

    service.createMembership({
      userId: "user-1",
      communityId: "community-1",
      now
    });

    expect(
      service.isActiveMember(
        "user-1",
        "community-1"
      )
    ).toBe(true);
  });

  it("marks a membership as left", () => {
    const service = new MembershipService();

    const membership =
      service.createMembership({
        userId: "user-1",
        communityId: "community-1",
        now
      });

    const leftAt = new Date(
      "2026-01-01T13:00:00.000Z"
    );

    const updated = service.leave(
      membership.id,
      leftAt
    );

    expect(updated.status).toBe("left");
    expect(updated.updatedAt).toBe(leftAt);

    expect(
      service.isActiveMember(
        "user-1",
        "community-1"
      )
    ).toBe(false);
  });

  it("marks a membership as banned", () => {
    const service = new MembershipService();

    const membership =
      service.createMembership({
        userId: "user-1",
        communityId: "community-1",
        now
      });

    service.ban(
      membership.id,
      new Date(
        "2026-01-01T13:00:00.000Z"
      )
    );

    expect(
      service.findMembership(
        "user-1",
        "community-1"
      )?.status
    ).toBe("banned");

    expect(
      service.isActiveMember(
        "user-1",
        "community-1"
      )
    ).toBe(false);
  });

  it("reactivates a membership", () => {
    const service = new MembershipService();

    const membership =
      service.createMembership({
        userId: "user-1",
        communityId: "community-1",
        now
      });

    service.leave(
      membership.id,
      new Date(
        "2026-01-01T13:00:00.000Z"
      )
    );

    service.reactivate(
      membership.id,
      new Date(
        "2026-01-01T14:00:00.000Z"
      )
    );

    expect(
      service.isActiveMember(
        "user-1",
        "community-1"
      )
    ).toBe(true);
  });

  it("returns all memberships of a user", () => {
    const service = new MembershipService();

    service.createMembership({
      userId: "user-1",
      communityId: "community-1",
      now
    });

    service.createMembership({
      userId: "user-1",
      communityId: "community-2",
      now
    });

    expect(
      service.getUserMemberships(
        "user-1"
      )
    ).toHaveLength(2);
  });

  it("returns all memberships of a community", () => {
    const service = new MembershipService();

    service.createMembership({
      userId: "user-1",
      communityId: "community-1",
      now
    });

    service.createMembership({
      userId: "user-2",
      communityId: "community-1",
      now
    });

    expect(
      service.getCommunityMemberships(
        "community-1"
      )
    ).toHaveLength(2);
  });

  it("rejects updating a missing membership", () => {
    const service = new MembershipService();

    expect(() => {
      service.updateStatus(
        "membership-999",
        "banned",
        now
      );
    }).toThrow(
      'Membership "membership-999" does not exist'
    );
  });
});