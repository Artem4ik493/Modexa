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
}

export class AuditService {
  constructor(private readonly store?: AuditStore) {}

  record(input: Omit<AuditEntry, "id" | "createdAt">): AuditEntry {
    const entry: AuditEntry = {
      ...input,
      id: `audit_${crypto.randomUUID()}`,
      createdAt: new Date()
    };
    this.store?.appendAudit(entry);
    return entry;
  }

  list(communityId: string, limit = 100): AuditEntry[] {
    return this.store?.getAuditEntries(communityId, limit) ?? [];
  }
}
