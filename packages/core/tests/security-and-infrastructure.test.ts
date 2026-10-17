import { describe, expect, it } from "vitest";
import {
  AutoModService,
  InteractionActionStore,
  BackupService,
  BillingService,
  ModexaDatabase,
  CardImageService
} from "../src/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("Modexa security and infrastructure", () => {
  it("builds branded image-card URLs for user and community stats", () => {
    const cards = new CardImageService();
    const stats = cards.stats({
      communityName: "Test",
      members: 10,
      activeCases: 2,
      totalCases: 5
    });
    const profile = cards.profile({
      displayName: "User",
      userId: "mx_1",
      accounts: "discord: @user"
    });

    expect(stats).toContain("quickchart.io/chart");
    expect(stats).toContain("format=png");
    expect(profile).toContain("quickchart.io/chart");
  });

  it("matches AutoMod keyword, link, caps and flood rules", () => {
    const auto = new AutoModService();

    auto.upsertRule({
      id: "keyword",
      communityId: "c",
      type: "keyword",
      value: "forbidden",
      enabled: true,
      action: "warn"
    });
    expect(auto.inspect({ communityId: "c", userId: "u", content: "FORBIDDEN" }).matched).toBe(true);

    auto.removeRule("keyword");
    auto.upsertRule({
      id: "link",
      communityId: "c",
      type: "link",
      enabled: true,
      action: "mute"
    });
    expect(auto.inspect({ communityId: "c", userId: "u", content: "visit https://example.com" }).reason).toBe("link");

    auto.removeRule("link");
    auto.upsertRule({
      id: "caps",
      communityId: "c",
      type: "caps",
      threshold: 0.8,
      enabled: true,
      action: "warn"
    });
    expect(auto.inspect({ communityId: "c", userId: "u", content: "THIS IS LOUD" }).reason).toBe("caps");

    auto.removeRule("caps");
    auto.upsertRule({
      id: "flood",
      communityId: "c",
      type: "flood",
      threshold: 3,
      enabled: true,
      action: "mute"
    });
    const now = new Date("2026-10-03T10:00:00Z");
    auto.inspect({ communityId: "c", userId: "u", content: "1", now });
    auto.inspect({ communityId: "c", userId: "u", content: "2", now: new Date(now.getTime()+1000) });
    expect(auto.inspect({ communityId: "c", userId: "u", content: "3", now: new Date(now.getTime()+2000) }).matched).toBe(true);
  });

  it("supports multiple AutoMod keywords and per-user/channel exclusions", () => {
    const auto = new AutoModService();
    auto.upsertRule({
      id: "keywords", communityId: "c", type: "keyword",
      value: "badword|scam phrase", enabled: true, action: "delete",
      ignoredUserIds: ["trusted-user"], ignoredChannelIds: ["trusted-channel"]
    });
    expect(auto.inspect({ communityId: "c", userId: "u", content: "this is a scam phrase" }).matched).toBe(true);
    expect(auto.inspect({ communityId: "c", userId: "trusted-user", content: "badword" }).matched).toBe(false);
    expect(auto.inspect({ communityId: "c", userId: "u", channelId: "trusted-channel", content: "badword" }).matched).toBe(false);
  });

  it("scopes interaction tokens and expires them", () => {
    const store = new InteractionActionStore({ ttlMs: 1000 });
    const now = new Date("2026-10-03T10:00:00Z");
    const token = store.create({
      action: { type: "callback", data: "menu.close" },
      scope: { userId: "u1", platform: "discord" },
      now
    });

    expect(store.resolve(token, { userId: "u2", platform: "discord" }, now).status).toBe("forbidden");
    expect(store.resolve(token, { userId: "u1", platform: "telegram" }, now).status).toBe("forbidden");
    expect(store.resolve(token, { userId: "u1", platform: "discord" }, new Date(now.getTime()+1001)).status).toBe("expired");
  });

  it("exports a compressed database backup and refuses unsafe live restore", () => {
    const dir = mkdtempSync(join(process.cwd(), ".modexa-backup-test-"));
    try {
      const database = new ModexaDatabase({ path: join(dir, "modexa.sqlite") });
      const backup = new BackupService(database);
      const artifact = backup.exportSnapshot();

      expect(artifact.compressed).toBe(true);
      expect(artifact.data.length).toBeGreaterThan(0);
      expect(() => backup.restoreSnapshot(artifact.data)).toThrow(/restarting Modexa/);
      database.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects automation creation when billing feature is disabled", async () => {
    const billing = new BillingService();
    billing.registerPlan({
      id: "free",
      name: "Free",
      entitlements: [{ feature: "automations", enabled: false }]
    });
    billing.createSubscription({ communityId: "c", planId: "free" });

    const { AutomationService } = await import("../src/automations/service.js");
    const automation = new AutomationService(billing);

    expect(() => automation.create({
      communityId: "c",
      name: "Blocked",
      trigger: { type: "interval", intervalSeconds: 60 },
      action: { type: "command", command: "stats" }
    })).toThrow(/automations/);
  });
});
