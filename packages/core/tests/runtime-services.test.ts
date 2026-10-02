import { describe, expect, it } from "vitest";

import {
  createRuntimeServices
} from "../src/runtime/services.js";

describe("createRuntimeServices", () => {
  it("wires the resolver to the shared services", () => {
    const services = createRuntimeServices();

    const result =
      services.identityResolver.resolve({
        platform: "telegram",
        author: {
          platform: "telegram",
          externalId: "111",
          displayName: "Artem"
        },
        community: {
          platform: "telegram",
          externalId: "-100500",
          name: "Group"
        }
      });

    expect(
      services.identityService.findUserByIdentity(
        "telegram",
        "111"
      )
    ).toEqual(result.user);

    expect(
      services.communityService.findByIdentity(
        "telegram",
        "-100500"
      )
    ).toBe(result.community);

    expect(
      services.membershipService.findMembership(
        result.user.id,
        result.community!.id
      )
    ).toBe(result.membership);
  });

  it("creates independent service sets", () => {
    const first = createRuntimeServices();
    const second = createRuntimeServices();

    first.identityResolver.resolve({
      platform: "telegram",
      author: {
        platform: "telegram",
        externalId: "111"
      }
    });

    expect(
      second.identityService.findUserByIdentity(
        "telegram",
        "111"
      )
    ).toBeUndefined();
  });
});