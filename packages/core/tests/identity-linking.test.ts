import { describe, expect, it } from "vitest";

import {
  IdentityLinkService
} from "../src/identity/link-service.js";

import {
  IdentityLinkingService
} from "../src/identity/linking.js";

import {
  IdentityService
} from "../src/identity/service.js";

describe("IdentityLinkingService", () => {
  function createServices() {
    const identityService = new IdentityService();
    const linkService = new IdentityLinkService();

    const linkingService =
      new IdentityLinkingService(
        identityService,
        linkService
      );

    return {
      identityService,
      linkService,
      linkingService
    };
  }

  it("links a Discord identity to a Telegram user's Modexa profile", () => {
    const {
      identityService,
      linkService,
      linkingService
    } = createServices();

    const createdAt = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const completedAt = new Date(
      "2026-01-01T12:05:00.000Z"
    );

    const user = identityService.createUser({
      displayName: "Artem",
      now: createdAt
    });

    identityService.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789",
      username: "artem",
      now: createdAt
    });

    const session = linkService.createLinkSession({
      userId: user.id,
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now: createdAt
    });

    const result = linkingService.completeLink({
      code: session.code,
      targetExternalId: "987654321",
      targetUsername: "artem_discord",
      targetDisplayName: "Artem Discord",
      now: completedAt
    });

    expect(result.session.status).toBe(
      "completed"
    );

    expect(result.identity.userId).toBe(
      user.id
    );

    expect(result.identity.platform).toBe(
      "discord"
    );

    expect(result.identity.externalId).toBe(
      "987654321"
    );

    expect(
      identityService.findUserByIdentity(
        "discord",
        "987654321"
      )
    ).toEqual(user);
  });

  it("keeps both platform identities under the same user", () => {
    const {
      identityService,
      linkService,
      linkingService
    } = createServices();

    const now = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const user = identityService.createUser({
      displayName: "Artem",
      now
    });

    identityService.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789",
      now
    });

    const session = linkService.createLinkSession({
      userId: user.id,
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now
    });

    linkingService.completeLink({
      code: session.code,
      targetExternalId: "987654321",
      now
    });

    const identities =
      identityService.getUserIdentities(
        user.id
      );

    expect(identities).toHaveLength(2);

    expect(
      identities.map(
        (identity) => identity.platform
      )
    ).toEqual(["telegram", "discord"]);
  });

  it("merges users when the target identity belongs to another user", () => {
    const {
      identityService,
      linkService,
      linkingService
    } = createServices();

    const now = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const sourceUser =
      identityService.createUser({
        displayName: "Telegram User",
        now
      });

    const targetUser =
      identityService.createUser({
        displayName: "Discord User",
        now
      });

    identityService.attachIdentity({
      userId: sourceUser.id,
      platform: "telegram",
      externalId: "123456789",
      now
    });

    identityService.attachIdentity({
      userId: targetUser.id,
      platform: "discord",
      externalId: "987654321",
      now
    });

    const session =
      linkService.createLinkSession({
        userId: sourceUser.id,
        sourcePlatform: "telegram",
        targetPlatform: "discord",
        expiresAt: new Date(
          "2026-01-01T12:10:00.000Z"
        ),
        now
      });

    const result =
      linkingService.completeLink({
        code: session.code,
        targetExternalId: "987654321",
        now
      });

    expect(result.session.status).toBe(
      "completed"
    );

    expect(
      identityService.getUserIdentities(
        sourceUser.id
      )
    ).toHaveLength(2);

    expect(
      identityService.getUserIdentities(
        sourceUser.id
      ).map(
        (identity) => identity.platform
      )
    ).toEqual([
      "telegram",
      "discord"
    ]);

    expect(
      identityService.getUser(
        targetUser.id
      )
    ).toBeUndefined();

    expect(
      identityService.findUserByIdentity(
        "discord",
        "987654321"
      )
    ).toEqual(sourceUser);
  });

  it("allows linking an identity that already belongs to the same user", () => {
    const {
      identityService,
      linkService,
      linkingService
    } = createServices();

    const now = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const user = identityService.createUser({
      displayName: "Artem",
      now
    });

    identityService.attachIdentity({
      userId: user.id,
      platform: "discord",
      externalId: "987654321",
      now
    });

    const session =
      linkService.createLinkSession({
        userId: user.id,
        sourcePlatform: "telegram",
        targetPlatform: "discord",
        expiresAt: new Date(
          "2026-01-01T12:10:00.000Z"
        ),
        now
      });

    const result =
      linkingService.completeLink({
        code: session.code,
        targetExternalId: "987654321",
        now
      });

    expect(result.session.status).toBe(
      "completed"
    );

    expect(
      identityService.getUserIdentities(
        user.id
      )
    ).toHaveLength(1);
  });

  it("does not complete an expired link", () => {
    const {
      identityService,
      linkService,
      linkingService
    } = createServices();

    const createdAt = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const expiredAt = new Date(
      "2026-01-01T12:11:00.000Z"
    );

    const user = identityService.createUser({
      displayName: "Artem",
      now: createdAt
    });

    const session =
      linkService.createLinkSession({
        userId: user.id,
        sourcePlatform: "telegram",
        targetPlatform: "discord",
        expiresAt: new Date(
          "2026-01-01T12:10:00.000Z"
        ),
        now: createdAt
      });

    expect(() => {
      linkingService.completeLink({
        code: session.code,
        targetExternalId: "987654321",
        now: expiredAt
      });
    }).toThrow(
      'Identity link session cannot be completed because its status is "expired"'
    );

    expect(
      identityService.findUserByIdentity(
        "discord",
        "987654321"
      )
    ).toBeUndefined();
  });
});