import { randomUUID } from "node:crypto";

export type AuditAction =
  | "message.delete"
  | "message.edit"
  | "message.clear"
  | "member.join"
  | "member.leave"
  | "member.ban"
  | "member.unban"
  | "member.kick"
  | "member.mute"
  | "member.unmute"
  | "member.warn"
  | "member.unwarn"
  | "member.roles"
  | "member.nickname"
  | "moderation.case.revoke"
  | "channel.create"
  | "channel.update"
  | "channel.delete"
  | "role.create"
  | "role.update"
  | "role.delete"
  | "role.assign"
  | "role.remove"
  | "automation.trigger"
  | "automod.trigger"
  | "system";

export interface AuditEntry {
  id: string;
  communityId: string;
  action: AuditAction;
  actorUserId?: string;
  targetUserId?: string;
  channelId?: string;
  messageId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditStore {
  appendAudit(entry: AuditEntry): void;
  getAuditEntries(communityId: string, limit?: number): AuditEntry[];
  getCommunitySetting?(communityId: string, key: string): string | undefined;
  deleteExpiredAuditEntries?(before?: Date): number;
}

export class AuditService {
  constructor(private readonly store?: AuditStore) {}

  record(input: Omit<AuditEntry, "id" | "createdAt">): AuditEntry {
    this.pruneExpired();
    const entry: AuditEntry = {
      ...input,
      id: `audit_${randomUUID()}`,
      createdAt: new Date()
    };
    if (this.store?.getCommunitySetting?.(entry.communityId, "moderation.logging_enabled") !== "false") {
      this.store?.appendAudit(entry);
    }
    return entry;
  }

  list(communityId: string, limit = 100): AuditEntry[] {
    this.pruneExpired();
    return this.store?.getAuditEntries(communityId, limit) ?? [];
  }

  pruneExpired(now = new Date()): number {
    const cutoff = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    return this.store?.deleteExpiredAuditEntries?.(cutoff) ?? 0;
  }
}
