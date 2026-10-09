import {
  describe,
  expect,
  it
} from "vitest";

import {
  ExecutionContextService
} from "../src/contexts/index.js";

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