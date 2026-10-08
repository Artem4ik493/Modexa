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
      "User 8"
    );
    expect(response.content).toContain(
      "User 9"
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
      "**🎭 Роли платформы:** @Moderator, @VIP"
    );
    expect(response.content).toContain(
      "**🟢 Статус:** member"
    );
    expect(response.content).toContain(
      "**📅 В платформе:**"
    );
  });

  it("resolves a native member by username when identity is not local yet", async () => {
    const identityService =
      new IdentityService();

    const membershipService =
      new MembershipService();

    const accessControlService =
      new AccessControlService();

    const communityId = "community-1";

    for (const role of createBuiltinCommunityRoles(communityId)) {
      accessControlService.registerCommunityRole(role);
    }

    const command =
      createMemberCommand(
        identityService,
        membershipService,
        accessControlService,
        {
          async getMember(
            _communityExternalId,
            userExternalId
          ) {
            if (userExternalId !== "discord-42") {
              return undefined;
            }

            return {
              user: {
                platform: "discord",
                externalId: "discord-42",
                username: "artem4ik493",
                displayName: "Artem",
                platformRole: "admin"
              },
              joinedAt:
                new Date("2026-02-03T12:00:00Z"),
              roles: ["Moderator"],
              status: "admin"
            };
          },

          async findMemberByUsername(
            _communityExternalId,
            username
          ) {
            return username === "artem4ik493"
              ? {
                  user: {
                    platform: "discord",
                    externalId: "discord-42",
                    username: "artem4ik493",
                    displayName: "Artem",
                    platformRole: "admin"
                  },
                  joinedAt:
                    new Date("2026-02-03T12:00:00Z"),
                  roles: ["Moderator"],
                  status: "admin"
                }
              : undefined;
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
        args: ["@artem4ik493"],
        rawText: "/member @artem4ik493"
      });

    expect(response.content).toContain("Artem");
    expect(response.content).toContain("@artem4ik493");
    expect(response.content).toContain("Moderator");
    expect(response.content).toContain("admin");
    expect(
      membershipService.getCommunityMemberships(
        communityId
      )
    ).toHaveLength(1);
    expect(
      accessControlService.getUserCommunityRoles(
        membershipService.getCommunityMemberships(
          communityId
        )[0]!.userId,
        communityId
      ).map((role) => role.name)
    ).toContain("ADMIN");
  });

});
