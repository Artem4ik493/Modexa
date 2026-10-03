import { describe, expect, it } from "vitest";

import {
  createMemberCommand,
  createMembersCommand
} from "../src/members/command.js";

import {
  IdentityService
} from "../src/identity/service.js";

import {
  MembershipService
} from "../src/memberships/service.js";

import {
  AccessControlService
} from "../src/access/service.js";

import {
  createBuiltinCommunityRoles
} from "../src/access/community-roles.js";

describe("member commands", () => {
  function createContext(
    identityService: IdentityService,
    communityId: string
  ) {
    const user =
      identityService.createUser({
        displayName: "Current User"
      });

    identityService.attachIdentity({
      userId: user.id,
      platform: "discord",
      externalId: "current",
      username: "current"
    });

    return {
      platform: "discord" as const,
      user,
      community: {
        id: communityId,
        name: "Test Guild",
        mode: "public" as const,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01")
      },
      execution: {
        type: "community" as const,
        platform: "discord" as const,
        correlationId: "test",
        user,
        community: {
          id: communityId,
          name: "Test Guild",
          mode: "public" as const,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01")
        },
        locale: "en" as const,
        capabilities: [
          "commands" as const,
          "member.view" as const
        ]
      },
      args: [],
      rawText: "/members"
    };
  }

  it("lists members with pagination and search", async () => {
    const identityService =
      new IdentityService();

    const membershipService =
      new MembershipService();

    const accessControlService =
      new AccessControlService();

    const communityId = "community-1";

    for (
      const role of createBuiltinCommunityRoles(
        communityId
      )
    ) {
      accessControlService.registerCommunityRole(
        role
      );
    }

    for (let index = 1; index <= 12; index++) {
      const user =
        identityService.createUser({
          displayName:
            index === 11
              ? "Target User"
              : `User ${index}`
        });

      identityService.attachIdentity({
        userId: user.id,
        platform: "discord",
        externalId: `discord-${index}`,
        username:
          index === 11
            ? "target"
            : `user${index}`
      });

      membershipService.createMembership({
        userId: user.id,
        communityId
      });

      accessControlService.assignCommunityRole(
        user.id,
        `${communityId}:member`
      );
    }

    const command =
      createMembersCommand(
        identityService,
        membershipService,
        accessControlService
      );

    const context =
      createContext(
        identityService,
        communityId
      );

    const response =
      await command.handler({
        ...context,
        args: ["2"]
      });

    expect(response.content).toContain(
      "Page: 2/2"
    );
    expect(response.content).toContain(
      "User 10"
    );
    expect(response.content).toContain(
      "Target User"
    );

    const searchResponse =
      await command.handler({
        ...context,
        args: ["target"]
      });

    expect(searchResponse.content).toContain(
      "Members: 1"
    );
    expect(searchResponse.content).toContain(
      "@target"
    );
  });

  it("renders native platform member details", async () => {
    const identityService =
      new IdentityService();

    const membershipService =
      new MembershipService();

    const accessControlService =
      new AccessControlService();

    const communityId = "community-1";

    for (
      const role of createBuiltinCommunityRoles(
        communityId
      )
    ) {
      accessControlService.registerCommunityRole(
        role
      );
    }

    const user =
      identityService.createUser({
        displayName: "Discord User"
      });

    identityService.attachIdentity({
      userId: user.id,
      platform: "discord",
      externalId: "discord-42",
      username: "discorduser"
    });

    membershipService.createMembership({
      userId: user.id,
      communityId
    });

    accessControlService.assignCommunityRole(
      user.id,
      `${communityId}:member`
    );

    const command =
      createMemberCommand(
        identityService,
        membershipService,
        accessControlService,
        {
          async getMember() {
            return {
              user: {
                platform: "discord",
                externalId: "discord-42",
                username: "discorduser",
                displayName: "Discord User"
              },
              joinedAt:
                new Date("2026-02-03T12:00:00Z"),
              roles: ["Moderator", "VIP"],
              status: "member"
            };
          },
          async listMembers() {
            return [];
          }
        }
      );

    const context =
      createContext(
        identityService,
        communityId
      );

    const response =
      await command.handler({
        ...context,
        user,
        args: ["@discorduser"],
        rawText: "/member @discorduser"
      });

    expect(response.content).toContain(
      "Platform roles: Moderator, VIP"
    );
    expect(response.content).toContain(
      "Platform status: member"
    );
    expect(response.content).toContain(
      "Joined platform:"
    );
  });
});
