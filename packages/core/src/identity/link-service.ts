import type {
  IdentityLinkSession,
  IdentityLinkSessionId,
  IdentityPlatform,
  UserId
} from "./types.js";

export interface CreateLinkSessionInput {
  userId: UserId;
  sourcePlatform: IdentityPlatform;
  targetPlatform: IdentityPlatform;
  expiresAt: Date;
  now?: Date;
}

export class IdentityLinkService {
  private readonly sessions = new Map<
    IdentityLinkSessionId,
    IdentityLinkSession
  >();

  private readonly codeIndex = new Map<
    string,
    IdentityLinkSessionId
  >();

  private nextSessionId = 1;

  createLinkSession(
    input: CreateLinkSessionInput
  ): IdentityLinkSession {
    if (input.sourcePlatform === input.targetPlatform) {
      throw new Error(
        "Source and target platforms must be different"
      );
    }

    const now = input.now ?? new Date();

    if (input.expiresAt <= now) {
      throw new Error(
        "Link session expiration must be in the future"
      );
    }

    const id =
      `link-session-${this.nextSessionId++}`;

    const code = this.generateCode();

    const session: IdentityLinkSession = {
      id,
      userId: input.userId,
      sourcePlatform: input.sourcePlatform,
      targetPlatform: input.targetPlatform,
      code,
      status: "pending",
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now
    };

    this.sessions.set(session.id, session);
    this.codeIndex.set(session.code, session.id);

    return session;
  }

  getSession(
    sessionId: IdentityLinkSessionId,
    now = new Date()
  ): IdentityLinkSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    this.expireIfNeeded(session, now);

    return session;
  }

  findByCode(
    code: string,
    now = new Date()
  ): IdentityLinkSession | undefined {
    const sessionId = this.codeIndex.get(code);

    if (!sessionId) {
      return undefined;
    }

    return this.getSession(sessionId, now);
  }

  completeSession(
    code: string,
    now = new Date()
  ): IdentityLinkSession {
    const session = this.findByCode(code, now);

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

    session.status = "completed";
    session.updatedAt = now;

    return session;
  }

  cancelSession(
    sessionId: IdentityLinkSessionId,
    now = new Date()
  ): IdentityLinkSession {
    const session = this.getSession(sessionId, now);

    if (!session) {
      throw new Error(
        "Identity link session not found"
      );
    }

    if (session.status !== "pending") {
      throw new Error(
        `Identity link session cannot be cancelled because its status is "${session.status}"`
      );
    }

    session.status = "cancelled";
    session.updatedAt = now;

    return session;
  }

  private expireIfNeeded(
    session: IdentityLinkSession,
    now: Date
  ): void {
    if (
      session.status === "pending" &&
      session.expiresAt <= now
    ) {
      session.status = "expired";
      session.updatedAt = now;
    }
  }

  private generateCode(): string {
    let code: string;

    do {
      code = Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase();
    } while (this.codeIndex.has(code));

    return code;
  }
}