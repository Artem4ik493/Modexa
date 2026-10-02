import {
  AccessControlService,
  CommunityAccessService
} from "../access/index.js";

import {
  BridgeService
} from "../bridge/service.js";

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
  ExecutionContextService
} from "../contexts/service.js";

import {
  IdentityLinkService,
  IdentityLinkingService,
  IdentityService
} from "../identity/index.js";

import {
  MembershipService
} from "../memberships/service.js";

import {
  PlatformIdentityResolver,
  type PlatformIdentityServices
} from "./identity.js";

export interface RuntimeServices
  extends PlatformIdentityServices {
  identityResolver:
    PlatformIdentityResolver;

  executionContextService:
    ExecutionContextService;

  communityAccessService:
    CommunityAccessService;

  identityLinkService:
    IdentityLinkService;

  identityLinkingService:
    IdentityLinkingService;

  bridgeService:
    BridgeService;
}

export function createRuntimeServices(
  logger?: Logger
): RuntimeServices {
  const identityService =
    new IdentityService();

  const identityLinkService =
    new IdentityLinkService();

  const identityLinkingService =
    new IdentityLinkingService(
      identityService,
      identityLinkService
    );

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

  const executionContextService =
    new ExecutionContextService(
      communityAccessService
    );

  const bridgeService =
    new BridgeService(
      communityService
    );

  const identityResolver =
    new PlatformIdentityResolver(
      {
        identityService,
        communityService,
        channelService,
        membershipService,
        accessControlService
      },
      logger
    );

  return {
    identityService,
    identityLinkService,
    identityLinkingService,
    communityService,
    channelService,
    membershipService,
    accessControlService,
    communityAccessService,
    bridgeService,
    identityResolver,
    executionContextService
  };
}
