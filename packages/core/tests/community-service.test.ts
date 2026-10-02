import { describe, expect, it } from "vitest";

import {
  CommunityService
} from "../src/communities/service.js";

describe("CommunityService", () => {
  const now = new Date(
    "2026-01-01T12:00:00.000Z"
  );

  it("creates a community", () => {
    const service = new CommunityService();

    const community =
      service.createCommunity({
        name: "Test Group",
        now
      });

    expect(community.id).toBe(
      "community-1"
    );

    expect(community.name).toBe(
      "Test Group"
    );

    expect(community.createdAt).toBe(now);
  });

  it("returns a community by id", () => {
    const service = new CommunityService();

    const community =
      service.createCommunity({
        name: "Test Group",
        now
      });

    expect(
      service.getCommunity(community.id)
    ).toBe(community);

    expect(
      service.getCommunity("community-999")
    ).toBeUndefined();
  });

  it("attaches an identity and finds the community by it", () => {
    const service = new CommunityService();

    const community =
      service.createCommunity({
        name: "Test Group",
        now
      });

    const identity = service.attachIdentity({
      communityId: community.id,
      platform: "telegram",
      externalId: "-100500",
      name: "Test Group",
      now
    });

    expect(identity.id).toBe(
      "community-identity-1"
    );

    expect(
      service.findByIdentity(
        "telegram",
        "-100500"
      )
    ).toBe(community);

    expect(
      service.findByIdentity(
        "discord",
        "-100500"
      )
    ).toBeUndefined();
  });

  it("returns the existing identity when attached twice to the same community", () => {
    const service = new CommunityService();

    const community =
      service.createCommunity({
        name: "Test Group",
        now
      });

    const first = service.attachIdentity({
      communityId: community.id,
      platform: "telegram",
      externalId: "-100500",
      now
    });

    const second = service.attachIdentity({
      communityId: community.id,
      platform: "telegram",
      externalId: "-100500",
      now
    });

    expect(second).toBe(first);
  });

  it("does not allow one external identity on two communities", () => {
    const service = new CommunityService();

    const first =
      service.createCommunity({
        name: "First",
        now
      });

    const second =
      service.createCommunity({
        name: "Second",
        now
      });

    service.attachIdentity({
      communityId: first.id,
      platform: "telegram",
      externalId: "-100500",
      now
    });

    expect(() => {
      service.attachIdentity({
        communityId: second.id,
        platform: "telegram",
        externalId: "-100500",
        now
      });
    }).toThrow(
      'Community identity "telegram:-100500" is already attached to another community'
    );
  });

  it("does not allow attaching an identity to a missing community", () => {
    const service = new CommunityService();

    expect(() => {
      service.attachIdentity({
        communityId: "community-999",
        platform: "telegram",
        externalId: "-100500",
        now
      });
    }).toThrow(
      'Community "community-999" does not exist'
    );
  });

  it("returns all identities of a community", () => {
    const service = new CommunityService();

    const community =
      service.createCommunity({
        name: "Test Group",
        now
      });

    service.attachIdentity({
      communityId: community.id,
      platform: "telegram",
      externalId: "-100500",
      now
    });

    service.attachIdentity({
      communityId: community.id,
      platform: "discord",
      externalId: "guild-1",
      now
    });

    expect(
      service.getCommunityIdentities(
        community.id
      )
    ).toHaveLength(2);
  });
});