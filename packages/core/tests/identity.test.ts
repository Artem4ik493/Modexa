import { describe, expect, it } from "vitest";
import { IdentityService } from "../src/identity/service.js";

describe("IdentityService", () => {
  it("creates a Modexa user", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    expect(user.id).toBe("user-1");
    expect(user.displayName).toBe("Artem");
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("attaches a Telegram identity to a user", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    const identity = service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789",
      username: "artem"
    });

    expect(identity.userId).toBe(user.id);
    expect(identity.platform).toBe("telegram");
    expect(identity.externalId).toBe("123456789");
    expect(identity.username).toBe("artem");
  });

  it("finds a user by external identity", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789"
    });

    const foundUser = service.findUserByIdentity(
      "telegram",
      "123456789"
    );

    expect(foundUser).toEqual(user);
  });

  it("returns all identities belonging to a user", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789"
    });

    service.attachIdentity({
      userId: user.id,
      platform: "discord",
      externalId: "987654321"
    });

    const identities =
      service.getUserIdentities(user.id);

    expect(identities).toHaveLength(2);

    expect(
      identities.map((identity) => identity.platform)
    ).toEqual(["telegram", "discord"]);
  });

  it("does not allow one identity to belong to two users", () => {
    const service = new IdentityService();

    const firstUser = service.createUser({
      displayName: "First User"
    });

    const secondUser = service.createUser({
      displayName: "Second User"
    });

    service.attachIdentity({
      userId: firstUser.id,
      platform: "discord",
      externalId: "987654321"
    });

    expect(() => {
      service.attachIdentity({
        userId: secondUser.id,
        platform: "discord",
        externalId: "987654321"
      });
    }).toThrow(
      'Identity "discord:987654321" is already attached to another user'
    );
  });

  it("allows reattaching the same identity to the same user", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    const firstIdentity = service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789"
    });

    const secondIdentity = service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789"
    });

    expect(secondIdentity).toBe(firstIdentity);
    expect(service.getUserIdentities(user.id)).toHaveLength(1);
  });

  it("does not allow attaching an identity to a missing user", () => {
    const service = new IdentityService();

    expect(() => {
      service.attachIdentity({
        userId: "user-999",
        platform: "telegram",
        externalId: "123456789"
      });
    }).toThrow('User "user-999" does not exist');
  });

  it("detaches an identity from a user", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    const telegramIdentity = service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789"
    });

    service.attachIdentity({
      userId: user.id,
      platform: "discord",
      externalId: "987654321"
    });

    service.detachIdentity(telegramIdentity.id);

    expect(
      service.findUserByIdentity(
        "telegram",
        "123456789"
      )
    ).toBeUndefined();

    expect(
      service.findUserByIdentity(
        "discord",
        "987654321"
      )
    ).toEqual(user);
  });

  it("does not allow detaching the last identity", () => {
    const service = new IdentityService();

    const user = service.createUser({
      displayName: "Artem"
    });

    const identity = service.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "123456789"
    });

    expect(() => {
      service.detachIdentity(identity.id);
    }).toThrow(
      "Cannot detach the last identity from a user"
    );
  });
});