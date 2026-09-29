import { describe, expect, it } from "vitest";
import type {
  Community,
  CommunityIdentity,
  ExternalIdentity,
  Membership,
  User
} from "../src/index.js";

describe("domain models", () => {
  it("represents a Modexa user independently from a platform", () => {
    const now = new Date();

    const user: User = {
      id: "user-1",
      displayName: "Artem",
      createdAt: now,
      updatedAt: now
    };

    expect(user.id).toBe("user-1");
    expect(user.displayName).toBe("Artem");
  });

  it("links a Telegram identity to a Modexa user", () => {
    const now = new Date();

    const identity: ExternalIdentity = {
      id: "identity-1",
      userId: "user-1",
      platform: "telegram",
      externalId: "123456789",
      username: "artem",
      displayName: "Artem",
      createdAt: now,
      updatedAt: now
    };

    expect(identity.userId).toBe("user-1");
    expect(identity.platform).toBe("telegram");
    expect(identity.externalId).toBe("123456789");
  });

  it("represents a platform-independent community", () => {
    const now = new Date();

    const community: Community = {
      id: "community-1",
      name: "Modexa Community",
      createdAt: now,
      updatedAt: now
    };

    expect(community.id).toBe("community-1");
    expect(community.name).toBe("Modexa Community");
  });

  it("links a Telegram community identity", () => {
    const now = new Date();

    const identity: CommunityIdentity = {
      id: "community-identity-1",
      communityId: "community-1",
      platform: "telegram",
      externalId: "-100123456789",
      name: "Modexa Community",
      createdAt: now,
      updatedAt: now
    };

    expect(identity.communityId).toBe("community-1");
    expect(identity.platform).toBe("telegram");
    expect(identity.externalId).toBe("-100123456789");
  });

  it("connects a user to a community through membership", () => {
    const now = new Date();

    const membership: Membership = {
      id: "membership-1",
      userId: "user-1",
      communityId: "community-1",
      status: "active",
      joinedAt: now,
      updatedAt: now
    };

    expect(membership.userId).toBe("user-1");
    expect(membership.communityId).toBe("community-1");
    expect(membership.status).toBe("active");
  });
});