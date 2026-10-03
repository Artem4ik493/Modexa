import { describe, expect, it } from "vitest";

import {
  ChannelService
} from "../src/channels/service.js";

import {
  CommunityService
} from "../src/communities/service.js";

import {
  ExecutionContextService
} from "../src/contexts/service.js";

import {
  IdentityService
} from "../src/identity/service.js";

import {
  MembershipService
} from "../src/memberships/service.js";

import {
  createPlatformExecutionContext
} from "../src/runtime/context.js";

import {
  PlatformIdentityResolver
} from "../src/runtime/identity.js";

const author = {
  platform: "telegram" as const,
  externalId: "111",
  displayName: "Artem",
  locale: "en-US"
};

const group = {
  platform: "telegram" as const,
  externalId: "-100500",
  name: "Test Group"
};

function createResolver() {
  return new PlatformIdentityResolver({
    identityService: new IdentityService(),
    communityService: new CommunityService(),
    channelService: new ChannelService(),
    membershipService:
      new MembershipService()
  });
}

describe("createPlatformExecutionContext", () => {
  it("keeps synthetic ids without resolved entities", () => {
    const context =
      createPlatformExecutionContext(
        new ExecutionContextService(),
        {
          platform: "telegram",
          correlationId: "corr-1",
          author,
          community: group,
          channel: group
        }
      );

    expect(context.user.id).toBe(
      "telegram:111"
    );

    expect(context.community?.id).toBe(
      "telegram:-100500"
    );

    expect(context.type).toBe("community");
  });

  it("uses real Modexa ids with resolved entities", () => {
    const resolved =
      createResolver().resolve({
        platform: "telegram",
        author,
        community: group,
        channel: group
      });

    const context =
      createPlatformExecutionContext(
        new ExecutionContextService(),
        {
          platform: "telegram",
          correlationId: "corr-1",
          author,
          community: group,
          channel: group,
          resolved
        }
      );

    expect(context.user.id).toMatch(
      /^mx_[0-9a-f-]{36}$/
    );

    expect(context.community?.id).toBe(
      "community-1"
    );

    expect(context.channel?.id).toBe(
      "channel-1"
    );

    expect(context.type).toBe("community");

    expect(context.locale).toBe("en");
  });

  it("creates a DM context with a real user", () => {
    const resolved =
      createResolver().resolve({
        platform: "telegram",
        author
      });

    const context =
      createPlatformExecutionContext(
        new ExecutionContextService(),
        {
          platform: "telegram",
          correlationId: "corr-1",
          author,
          resolved
        }
      );

    expect(context.type).toBe("dm");

    expect(context.user.id).toMatch(
      /^mx_[0-9a-f-]{36}$/
    );

    expect(context.community).toBeUndefined();
  });
});