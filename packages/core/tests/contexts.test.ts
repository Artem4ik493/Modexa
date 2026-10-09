import {
  describe,
  expect,
  it
} from "vitest";

import {
  ExecutionContextService
} from "../src/contexts/index.js";

import { AccessControlService } from "../src/access/service.js";
import { CommunityAccessService } from "../src/access/community-access.js";
import { MembershipService } from "../src/memberships/service.js";

import type {
  Community
} from "../src/communities/types.js";

import type {
  User
} from "../src/identity/types.js";

describe(
  "ExecutionContextService",
  () => {
    const user: User = {
      id: "user-1",
      displayName: "Artem",
      createdAt: new Date(
        "2026-01-01T00:00:00.000Z"
      ),
      updatedAt: new Date(
        "2026-01-01T00:00:00.000Z"
      )
    };

    const community: Community = {
      id: "community-1",
      name: "Test Community",
      createdAt: new Date(
        "2026-01-01T00:00:00.000Z"
      ),
      updatedAt: new Date(
        "2026-01-01T00:00:00.000Z"
      )
    };

    it("creates a DM context", () => {
      const service =
        new ExecutionContextService();

      const context =
        service.create({
          platform: "telegram",
          user
        });

      expect(context.type).toBe(
        "dm"
      );

      expect(
        context.community
      ).toBeUndefined();

      expect(
        service.hasCapability(
          context,
          "identity.link"
        )
      ).toBe(true);

      expect(
        service.hasCapability(
          context,
          "billing"
        )
      ).toBe(true);

      expect(
        service.canModerate(
          context
        )
      ).toBe(false);
    });

    it("creates a community context", () => {
      const service =
        new ExecutionContextService();

      const context =
        service.create({
          platform: "telegram",
          user,
          community
        });

      expect(context.type).toBe(
        "community"
      );

      expect(
        context.community
      ).toBe(community);

      expect(
        service.hasCapability(
          context,
          "moderation"
        )
      ).toBe(false);

      expect(
        service.canModerate(
          context
        )
      ).toBe(false);

      expect(context.permissions).toEqual([]);
    });

    it("does not expose community capabilities in DM", () => {
      const service =
        new ExecutionContextService();

      const context =
        service.create({
          platform: "telegram",
          user
        });

      expect(
        service.hasCapability(
          context,
          "moderation"
        )
      ).toBe(false);

      expect(
        service.hasCapability(
          context,
          "bridge"
        )
      ).toBe(false);

      expect(
        service.hasCapability(
          context,
          "community.manage"
        )
      ).toBe(false);
    });

    it("resolves exact permissions and does not broaden a warn-only role", () => {
      const membershipService = new MembershipService();
      const accessControlService = new AccessControlService();
      const role = {
        id: "community-1:warn-only",
        communityId: community.id,
        name: "WARN_ONLY",
        permissions: ["commands.use", "moderation.warn"] as const
      };

      accessControlService.registerCommunityRole({
        ...role,
        permissions: [...role.permissions]
      });
      accessControlService.assignCommunityRole(user.id, role.id);
      membershipService.createMembership({
        userId: user.id,
        communityId: community.id
      });

      const service = new ExecutionContextService(
        new CommunityAccessService(membershipService, accessControlService),
        accessControlService
      );
      const context = service.create({
        platform: "telegram",
        user,
        community
      });

      expect(context.permissions).toContain("moderation.warn");
      expect(context.permissions).not.toContain("moderation.mute");
      expect(context.capabilities).toContain("moderation.warn");
      expect(context.capabilities).not.toContain("moderation.mute");
      expect(context.capabilities).toContain("commands");
    });

    it("does not expose account linking as a community-only capability", () => {
      const service =
        new ExecutionContextService();

      const context =
        service.create({
          platform: "telegram",
          user,
          community
        });

      expect(
        service.hasCapability(
          context,
          "identity.link"
        )
      ).toBe(false);
    });
  }
);