import {
  IdentityLinkService
} from "./link-service.js";

import {
  IdentityService
} from "./service.js";

import type {
  AccessControlService
} from "../access/service.js";

import type {
  MembershipService
} from "../memberships/service.js";

import type {
  ExternalIdentity,
  IdentityLinkSession,
  IdentityPlatform
} from "./types.js";

export interface CompleteIdentityLinkInput {
  code: string;
  targetExternalId: string;
  targetUsername?: string;
  targetDisplayName?: string;
  now?: Date;
}

export interface CompleteIdentityLinkResult {
  session: IdentityLinkSession;
  identity: ExternalIdentity;
}

export class IdentityLinkingService {
  constructor(
    private readonly identityService: IdentityService,
    private readonly linkService: IdentityLinkService,
    private readonly accessControlService?: AccessControlService,
    private readonly membershipService?: MembershipService
  ) {}

  completeLink(
    input: CompleteIdentityLinkInput
  ): CompleteIdentityLinkResult {
    const now = input.now ?? new Date();

    const session = this.linkService.findByCode(
      input.code,
      now
    );

    if (!session) {
      throw new Error(
        "Identity link session not found"
      );
    }

    if (session.status !== "pending") {
      throw new Error(
        `Identity link session cannot be completed because its status is "${session.status}"`
      );
    }

    const existingUser =
      this.identityService.findUserByIdentity(
        session.targetPlatform,
        input.targetExternalId
      );

    const sourceUser =
      this.identityService.getUser(
        session.userId
      );

    if (!sourceUser) {
      throw new Error(
        "Identity link source user does not exist"
      );
    }

    const sourceUserIds = [
      session.userId,
      ...(existingUser &&
      existingUser.id !== session.userId
        ? [existingUser.id]
        : [])
    ];

    const linkedUser =
      this.identityService.createLinkedUser(
        sourceUserIds,
        {
          displayName:
            sourceUser.displayName,
          now
        }
      );

    this.accessControlService?.moveUsers(
      sourceUserIds,
      linkedUser.id
    );

    this.membershipService?.moveUsers(
      sourceUserIds,
      linkedUser.id,
      now
    );

    const identity =
      this.identityService.attachIdentity({
        userId: linkedUser.id,
        platform: session.targetPlatform,
        externalId: input.targetExternalId,
        username: input.targetUsername,
        displayName: input.targetDisplayName,
        now
      });

    const completedSession =
      this.linkService.completeSession(
        input.code,
        now
      );

    return {
      session: completedSession,
      identity
    };
  }
}