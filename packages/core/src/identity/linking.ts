import {
  IdentityLinkService
} from "./link-service.js";

import {
  IdentityService
} from "./service.js";

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
    private readonly linkService: IdentityLinkService
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

    if (
      existingUser &&
      existingUser.id !== session.userId
    ) {
      throw new Error(
        `Target identity "${session.targetPlatform}:${input.targetExternalId}" is already attached to another user`
      );
    }

    const identity =
      this.identityService.attachIdentity({
        userId: session.userId,
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