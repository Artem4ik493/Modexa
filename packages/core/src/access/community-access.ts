import type { CommunityId } from "../communities/types.js";
import type { UserId } from "../identity/types.js";
import { MembershipService } from "../memberships/service.js";
import { AccessControlService } from "./service.js";
import type { Permission } from "./types.js";

export class CommunityAccessService {
  constructor(
    private readonly membershipService: MembershipService,
    private readonly accessControlService: AccessControlService
  ) {}

  can(
    userId: UserId,
    communityId: CommunityId,
    permission: Permission
  ): boolean {
    const membership =
      this.membershipService.findMembership(
        userId,
        communityId
      );

    if (!membership) {
      return false;
    }

    if (membership.status !== "active") {
      return false;
    }

    return this.accessControlService.hasCommunityPermission(
      userId,
      communityId,
      permission
    );
  }
}