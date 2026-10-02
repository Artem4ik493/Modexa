import {
  ChannelService
} from "../channels/service.js";

import {
  CommunityService
} from "../communities/service.js";

import type {
  Logger
} from "../diagnostics/types.js";

import {
  IdentityService
} from "../identity/service.js";

import {
  MembershipService
} from "../memberships/service.js";

import {
  PlatformIdentityResolver,
  type PlatformIdentityServices
} from "./identity.js";

export interface RuntimeServices
  extends PlatformIdentityServices {
  identityResolver: PlatformIdentityResolver;
}

/**
 * Creates the set of services that all platform adapters
 * must share, so that Telegram and Discord work with the
 * same users, communities and memberships.
 */
export function createRuntimeServices(
  logger?: Logger
): RuntimeServices {
  const identityService =
    new IdentityService();

  const communityService =
    new CommunityService();

  const channelService =
    new ChannelService();

  const membershipService =
    new MembershipService();

  const identityResolver =
    new PlatformIdentityResolver(
      {
        identityService,
        communityService,
        channelService,
        membershipService
      },
      logger
    );

  return {
    identityService,
    communityService,
    channelService,
    membershipService,
    identityResolver
  };
}