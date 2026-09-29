import { describe, expect, it } from "vitest";
import { IdentityLinkService } from "../src/identity/link-service.js";

describe("IdentityLinkService", () => {
  it("creates a pending link session", () => {
    const service = new IdentityLinkService();

    const now = new Date("2026-01-01T12:00:00.000Z");
    const expiresAt = new Date(
      "2026-01-01T12:10:00.000Z"
    );

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt,
      now
    });

    expect(session.id).toBe("link-session-1");
    expect(session.userId).toBe("user-1");
    expect(session.sourcePlatform).toBe("telegram");
    expect(session.targetPlatform).toBe("discord");
    expect(session.status).toBe("pending");
    expect(session.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(session.createdAt).toBe(now);
    expect(session.expiresAt).toBe(expiresAt);
  });

  it("finds a session by its code", () => {
    const service = new IdentityLinkService();

    const now = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now
    });

    const found = service.findByCode(
      session.code,
      now
    );

    expect(found).toBe(session);
  });

  it("completes a pending link session", () => {
    const service = new IdentityLinkService();

    const createdAt = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const completedAt = new Date(
      "2026-01-01T12:05:00.000Z"
    );

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now: createdAt
    });

    const completed = service.completeSession(
      session.code,
      completedAt
    );

    expect(completed.status).toBe("completed");
    expect(completed.updatedAt).toEqual(
      completedAt
    );
  });

  it("expires a session after its expiration time", () => {
    const service = new IdentityLinkService();

    const createdAt = new Date(
      "2026-01-01T12:00:00.000Z"
    );

    const expiredAt = new Date(
      "2026-01-01T12:11:00.000Z"
    );

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now: createdAt
    });

    const refreshed = service.getSession(
      session.id,
      expiredAt
    );

    expect(refreshed?.status).toBe("expired");
    expect(refreshed?.updatedAt).toEqual(
      expiredAt
    );
  });

  it("does not allow completing an expired session", () => {
    const service = new IdentityLinkService();

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now: new Date(
        "2026-01-01T12:00:00.000Z"
      )
    });

    expect(() => {
      service.completeSession(
        session.code,
        new Date("2026-01-01T12:11:00.000Z")
      );
    }).toThrow(
      'Identity link session cannot be completed because its status is "expired"'
    );
  });

  it("cancels a pending session", () => {
    const service = new IdentityLinkService();

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now: new Date(
        "2026-01-01T12:00:00.000Z"
      )
    });

    const cancelled = service.cancelSession(
      session.id,
      new Date("2026-01-01T12:05:00.000Z")
    );

    expect(cancelled.status).toBe("cancelled");
  });

  it("does not allow linking the same platform to itself", () => {
    const service = new IdentityLinkService();

    expect(() => {
      service.createLinkSession({
        userId: "user-1",
        sourcePlatform: "telegram",
        targetPlatform: "telegram",
        expiresAt: new Date(
          "2026-01-01T12:10:00.000Z"
        ),
        now: new Date(
          "2026-01-01T12:00:00.000Z"
        )
      });
    }).toThrow(
      "Source and target platforms must be different"
    );
  });

  it("does not allow an already expired session", () => {
    const service = new IdentityLinkService();

    expect(() => {
      service.createLinkSession({
        userId: "user-1",
        sourcePlatform: "telegram",
        targetPlatform: "discord",
        expiresAt: new Date(
          "2026-01-01T11:59:00.000Z"
        ),
        now: new Date(
          "2026-01-01T12:00:00.000Z"
        )
      });
    }).toThrow(
      "Link session expiration must be in the future"
    );
  });

  it("does not allow cancelling a completed session", () => {
    const service = new IdentityLinkService();

    const session = service.createLinkSession({
      userId: "user-1",
      sourcePlatform: "telegram",
      targetPlatform: "discord",
      expiresAt: new Date(
        "2026-01-01T12:10:00.000Z"
      ),
      now: new Date(
        "2026-01-01T12:00:00.000Z"
      )
    });

    service.completeSession(
      session.code,
      new Date("2026-01-01T12:05:00.000Z")
    );

    expect(() => {
      service.cancelSession(
        session.id,
        new Date("2026-01-01T12:06:00.000Z")
      );
    }).toThrow(
      'Identity link session cannot be cancelled because its status is "completed"'
    );
  });
});