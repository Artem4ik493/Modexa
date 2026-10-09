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
  BillingService,
  createBuiltinPlans
} from "../billing/index.js";

import { CommandSettingsService } from "../commands/settings.js";
import { AutomationService } from "../automations/service.js";
import { AuditService } from "../audit/service.js";
import { RankingService } from "../ranking/service.js";
import { WelcomeService } from "../welcome/service.js";
import { CustomCommandService } from "../custom-commands/service.js";

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

  billingService:
    BillingService;

  automationService:
    AutomationService;

  commandSettingsService:
    CommandSettingsService;

  auditService:
    AuditService;

  rankingService:
    RankingService;

  welcomeService:
    WelcomeService;

  customCommandService:
    CustomCommandService;
}

export function createRuntimeServices(
  logger?: Logger,
  database?: ModexaDatabase
): RuntimeServices {
  const identityService =
    new IdentityService(database);

  const identityLinkService =
    new IdentityLinkService();

  const billingService =
    new BillingService(database);

  for (const plan of createBuiltinPlans()) {
    billingService.registerPlan({
      id: plan.id,
      name: plan.name,
      entitlements: plan.entitlements
    });
  }

  const communityService =
    new CommunityService(
      database,
      billingService
    );

  const commandSettingsService =
    new CommandSettingsService(database);

  const automationService =
    new AutomationService(
      billingService,
      database
    );

  const auditService =
    new AuditService(database);

  const rankingService =
    new RankingService(database);

  const welcomeService =
    new WelcomeService();

  const customCommandService =
    new CustomCommandService();

  const channelService =
    new ChannelService();

  const membershipService =
    new MembershipService(database);

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
    billingService,
    automationService,
    commandSettingsService,
    auditService,
    rankingService,
    welcomeService,
    customCommandService,
    identityResolver,
    executionContextService
  };
}
