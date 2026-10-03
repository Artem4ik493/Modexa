import {
  AccessControlService,
  CommunityAccessService,
  MODEXA_OWNER_ROLE
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
  ModexaDatabase
} from "../database/service.js";

import {
  ModerationService
} from "../moderation/service.js";

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

  moderationService:
    ModerationService;
}

export function createRuntimeServices(
  logger?: Logger,
  database?: ModexaDatabase
): RuntimeServices {
  const identityService =
    new IdentityService(database);

  const identityLinkService =
    new IdentityLinkService();

  const communityService =
    new CommunityService(database);

  const channelService =
    new ChannelService();

  const membershipService =
    new MembershipService();

  const accessControlService =
    new AccessControlService(database, database);

  accessControlService.registerSystemRole(
    MODEXA_OWNER_ROLE
  );

  const identityLinkingService =
    new IdentityLinkingService(
      identityService,
      identityLinkService,
      accessControlService,
      membershipService
    );

  const communityAccessService =
    new CommunityAccessService(
      membershipService,
      accessControlService
    );

  const executionContextService =
    new ExecutionContextService(
      communityAccessService,
      accessControlService
    );

  const bridgeService =
    new BridgeService(
      communityService,
      database
    );

  const moderationService =
    new ModerationService(
      accessControlService,
      database
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
    moderationService,
    identityResolver,
    executionContextService
  };
}
