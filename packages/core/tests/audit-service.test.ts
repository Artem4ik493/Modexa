import { describe, expect, it, vi } from "vitest";

import { AuditService, type AuditEntry, type AuditStore } from "../src/audit/service.js";

function createStore(overrides: Partial<AuditStore> = {}) {
  const entries: AuditEntry[] = [];
  const store: AuditStore = {
    appendAudit: vi.fn((entry: AuditEntry) => {
      entries.push(entry);
    }),
    getAuditEntries: vi.fn(() => entries),
    deleteExpiredAuditEntries: vi.fn(() => 2),
    ...overrides
  };
  return { store, entries };
}

describe("AuditService", () => {
  it("records an audit entry with an id and timestamp", () => {
    const { store, entries } = createStore();
    const service = new AuditService(store);

    const entry = service.record({
      communityId: "community-1",
      action: "member.warn",
      actorUserId: "user-1",
      targetUserId: "user-2",
      reason: "Test reason"
    });

    expect(entry.id).toMatch(/^audit_/);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entries).toHaveLength(1);
    expect(store.appendAudit).toHaveBeenCalledWith(entry);
  });

  it("prunes entries older than five days before recording", () => {
    const { store } = createStore();
    const service = new AuditService(store);
    const now = new Date("2026-10-13T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      service.record({
        communityId: "community-1",
        action: "member.ban"
      });

      expect(store.deleteExpiredAuditEntries).toHaveBeenCalledWith(
        new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not persist entries when logging is disabled for the community", () => {
    const { store, entries } = createStore({
      getCommunitySetting: vi.fn(() => "false")
    });
    const service = new AuditService(store);

    service.record({
      communityId: "community-1",
      action: "member.kick"
    });

    expect(entries).toHaveLength(0);
    expect(store.appendAudit).not.toHaveBeenCalled();
  });

  it("prunes expired entries before listing audit history", () => {
    const { store } = createStore();
    const service = new AuditService(store);

    expect(service.list("community-1", 25)).toEqual([]);
    expect(store.deleteExpiredAuditEntries).toHaveBeenCalledTimes(1);
    expect(store.getAuditEntries).toHaveBeenCalledWith("community-1", 25);
  });
});
