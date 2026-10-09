import { describe, expect, it } from "vitest";

import {
  ChannelService
} from "../src/channels/service.js";

import {
  CommunityService
} from "../src/communities/service.js";

import {
  IdentityService
} from "../src/identity/service.js";

import {
  MembershipService
} from "../src/memberships/service.js";

import {
  AccessControlService,
  COMMUNITY_ROLE_NAMES,
  CommunityAccessService,
  PlatformIdentityResolver
} from "../src/index.js";

function createResolver() {
  const identityService =
    new IdentityService();

  const communityService =
    new CommunityService();

  const channelService =
    new ChannelService();

  const membershipService =
    new MembershipService();

  const accessControlService =
    new AccessControlService();

  const communityAccessService =
    new CommunityAccessService(
      membershipService,
      accessControlService
    );

  const resolver =
    new PlatformIdentityResolver({
      identityService,
      communityService,
      channelService,
      membershipService,
      accessControlService
    });

  return {
    identityService,
    communityService,
    channelService,
    membershipService,
    accessControlService,
    communityAccessService,
    resolver
  };
}

const telegramAuthor = {
  platform: "telegram" as const,
  externalId: "111",
  username: "artem",
  displayName: "Artem"
};

const telegramGroup = {
  platform: "telegram" as const,
  externalId: "-100500",
  name: "Test Group"
};

describe("PlatformIdentityResolver", () => {
  it("creates a Modexa user on first sight", () => {
    const { resolver, identityService } =
      createResolver();

    const result = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor
    });

    expect(result.user.id).toMatch(
      /^mx_[0-9a-f-]{36}$/
    );

    expect(result.user.displayName).toBe(
      "Artem"
    );

    expect(
      identityService.findUserByIdentity(
        "telegram",
        "111"
      )
    ).toEqual(result.user);
  });

  it("returns the same user for the same platform identity", () => {
    const { resolver } = createResolver();

    const first = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor
    });

    const second = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor
    });

    expect(second.user).toBe(first.user);
  });

  it("never merges Telegram and Discord identities automatically", () => {
    const { resolver, identityService } =
      createResolver();

    const telegram = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor
    });

    const discord = resolver.resolve({
      platform: "discord",
      author: {
        platform: "discord",
        externalId: "111",
        username: "artem",
        displayName: "Artem"
      }
    });

    expect(discord.user.id).not.toBe(
      telegram.user.id
    );

    expect(
      identityService.getUserIdentities(
        telegram.user.id
      )
    ).toHaveLength(1);
  });

  it("falls back to username, then external id, for the display name", () => {
    const { resolver } = createResolver();

    const withUsername = resolver.resolve({
      platform: "telegram",
      author: {
        platform: "telegram",
        externalId: "222",
        username: "nick"
      }
    });

    const bare = resolver.resolve({
      platform: "telegram",
      author: {
        platform: "telegram",
        externalId: "333"
      }
    });

    expect(withUsername.user.displayName).toBe(
      "nick"
    );

    expect(bare.user.displayName).toBe("333");
  });

  it("does not create a community or membership in a DM", () => {
    const { resolver, membershipService } =
      createResolver();

    const result = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor
    });

    expect(result.community).toBeUndefined();
    expect(result.channel).toBeUndefined();
    expect(result.membership).toBeUndefined();

    expect(
      membershipService.getUserMemberships(
        result.user.id
      )
    ).toHaveLength(0);
  });

  it("syncs a platform admin to the Modexa ADMIN role", () => {
    const {
      resolver,
      accessControlService,
      communityAccessService
    } = createResolver();

    const result = resolver.resolve({
      platform: "telegram",
      author: {
        ...telegramAuthor,
        platformRole: "admin"
      },
      community: telegramGroup,
      channel: telegramGroup
    });

    const roles =
      accessControlService.getUserCommunityRoles(
        result.user.id,
        result.community!.id
      );

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe(
      COMMUNITY_ROLE_NAMES.ADMIN
    );

    expect(
      communityAccessService.can(
        result.user.id,
        result.community!.id,
        "commands.manage"
      )
    ).toBe(true);

    expect(
      communityAccessService.can(
        result.user.id,
        result.community!.id,
        "moderation.ban"
      )
    ).toBe(true);
  });

  it("syncs a verified platform owner to the Modexa OWNER role", () => {
    const {
      resolver,
      accessControlService
    } = createResolver();

    const result = resolver.resolve({
      platform: "discord",
      author: {
        platform: "discord",
        externalId: "owner-1",
        displayName: "Owner",
        platformRole: "owner"
      },
      community: {
        platform: "discord",
        externalId: "guild-1",
        name: "Guild"
      }
    });

    const roles =
      accessControlService.getUserCommunityRoles(
        result.user.id,
        result.community!.id
      );

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe(
      COMMUNITY_ROLE_NAMES.OWNER
    );
  });

  it("syncs a platform member to the Modexa MEMBER role", () => {
    const {
      resolver,
      accessControlService,
      communityAccessService
    } = createResolver();

    const result = resolver.resolve({
      platform: "telegram",
      author: {
        ...telegramAuthor,
        platformRole: "member"
      },
      community: telegramGroup
    });

    const roles =
      accessControlService.getUserCommunityRoles(
        result.user.id,
        result.community!.id
      );

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe(
      COMMUNITY_ROLE_NAMES.MEMBER
    );

    expect(
      communityAccessService.can(
        result.user.id,
        result.community!.id,
        "commands.use"
      )
    ).toBe(true);

    expect(
      communityAccessService.can(
        result.user.id,
        result.community!.id,
        "commands.manage"
      )
    ).toBe(false);
  });

  it("updates the Modexa community role when the platform role changes", () => {
    const {
      resolver,
      accessControlService
    } = createResolver();

    const input = {
      platform: "telegram" as const,
      author: {
        ...telegramAuthor,
        platformRole: "admin" as const
      },
      community: telegramGroup
    };

    const first = resolver.resolve(input);

    expect(
      accessControlService.getUserCommunityRoles(
        first.user.id,
        first.community!.id
      )[0].name
    ).toBe(COMMUNITY_ROLE_NAMES.ADMIN);

    const second = resolver.resolve({
      ...input,
      author: {
        ...input.author,
        platformRole: "member"
      }
    });

    const roles =
      accessControlService.getUserCommunityRoles(
        second.user.id,
        second.community!.id
      );

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe(
      COMMUNITY_ROLE_NAMES.MEMBER
    );
  });

  it("creates community, channel and active membership in a group", () => {
    const { resolver, membershipService } =
      createResolver();

    const result = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor,
      community: telegramGroup,
      channel: telegramGroup
    });

    expect(result.community?.id).toBe(
      "community-1"
    );

    expect(result.community?.name).toBe(
      "Test Group"
    );

    expect(result.channel?.communityId).toBe(
      result.community?.id
    );

    expect(result.channel?.type).toBe(
      "telegram_chat"
    );

    expect(result.membership?.status).toBe(
      "active"
    );

    expect(
      membershipService.findMembership(
        result.user.id,
        result.community!.id
      )
    ).toBe(result.membership);
  });

  it("reuses the community, channel and membership on repeat", () => {
    const { resolver, communityService } =
      createResolver();

    const input = {
      platform: "telegram" as const,
      author: telegramAuthor,
      community: telegramGroup,
      channel: telegramGroup
    };

    const first = resolver.resolve(input);
    const second = resolver.resolve({ ...input, reactivateMembership: true });

    expect(second.community).toBe(
      first.community
    );

    expect(second.channel).toBe(first.channel);

    expect(second.membership?.id).toBe(
      first.membership?.id
    );

    expect(
      communityService.getCommunities()
    ).toHaveLength(1);
  });

  it("creates one community with several memberships", () => {
    const { resolver, membershipService } =
      createResolver();

    const first = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor,
      community: telegramGroup,
      channel: telegramGroup
    });

    resolver.resolve({
      platform: "telegram",
      author: {
        platform: "telegram",
        externalId: "222",
        displayName: "Second"
      },
      community: telegramGroup,
      channel: telegramGroup
    });

    expect(
      membershipService.getCommunityMemberships(
        first.community!.id
      )
    ).toHaveLength(2);
  });

  it("reactivates a membership that was left", () => {
    const { resolver, membershipService } =
      createResolver();

    const input = {
      platform: "telegram" as const,
      author: telegramAuthor,
      community: telegramGroup,
      channel: telegramGroup
    };

    const first = resolver.resolve(input);

    membershipService.leave(
      first.membership!.id
    );

    const second = resolver.resolve({ ...input, reactivateMembership: true });

    expect(second.membership?.status).toBe(
      "active"
    );
  });

  it("reactivates a stale ban when the platform confirms the user is present", () => {
    const { resolver, membershipService } =
      createResolver();

    const input = {
      platform: "telegram" as const,
      author: telegramAuthor,
      community: telegramGroup,
      channel: telegramGroup
    };

    const first = resolver.resolve(input);

    membershipService.ban(
      first.membership!.id
    );

    // Resolving a real message from this user proves they can currently
    // participate on the platform, so the cached membership must recover.
    const second = resolver.resolve({ ...input, reactivateMembership: true });

    expect(second.membership?.status).toBe(
      "active"
    );
  });

  it("uses the Discord channel type for Discord", () => {
    const { resolver } = createResolver();

    const result = resolver.resolve({
      platform: "discord",
      author: {
        platform: "discord",
        externalId: "d-1",
        displayName: "Discord User"
      },
      community: {
        platform: "discord",
        externalId: "guild-1",
        name: "Guild"
      },
      channel: {
        platform: "discord",
        externalId: "channel-1",
        name: "general"
      }
    });

    expect(result.channel?.type).toBe(
      "discord_text"
    );
  });

  it("ignores a channel that has no community", () => {
    const { resolver } = createResolver();

    const result = resolver.resolve({
      platform: "telegram",
      author: telegramAuthor,
      channel: telegramGroup
    });

    expect(result.channel).toBeUndefined();
  });
});