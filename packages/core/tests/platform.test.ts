import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  IdentityService,
  CommunityService,
  MembershipService,
  BillingService,
  AutomationService,
  ModerationService,
  BridgeService,
  ModexaDatabase,
  CommandSettingsService,
  CommandRegistry,
  CommandParser,
  CommandService
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Modexa core", () => {
  it("creates users and binds platform identities", () => {
    const identities = new IdentityService();
    const user = identities.createUser({ displayName: "Artem" });
    const identity = identities.attachIdentity({
      userId: user.id,
      platform: "discord",
      externalId: "100",
      username: "artem"
    });

    expect(identities.findUserByIdentity("discord", "100")?.id).toBe(user.id);
    expect(identities.findUserByUsername("ARTEM", "discord")?.id).toBe(user.id);
    expect(identity.userId).toBe(user.id);
  });

  it("prevents duplicate community identities", () => {
    const communities = new CommunityService();
    const first = communities.createCommunity({ name: "A" });
    const second = communities.createCommunity({ name: "B" });

    communities.attachIdentity({
      communityId: first.id,
      platform: "telegram",
      externalId: "42"
    });

    expect(() =>
      communities.attachIdentity({
        communityId: second.id,
        platform: "telegram",
        externalId: "42"
      })
    ).toThrow(/already attached/);
  });

  it("manages memberships and status transitions", () => {
    const identities = new IdentityService();
    const communities = new CommunityService();
    const memberships = new MembershipService();
    const user = identities.createUser({ displayName: "User" });
    const community = communities.createCommunity({ name: "Community" });
    const membership = memberships.createMembership({
      userId: user.id,
      communityId: community.id
    });

    expect(memberships.isActiveMember(user.id, community.id)).toBe(true);
    memberships.ban(membership.id);
    expect(memberships.isActiveMember(user.id, community.id)).toBe(false);
    memberships.reactivate(membership.id);
    expect(memberships.isActiveMember(user.id, community.id)).toBe(true);
  });

  it("persists billing and automation state across database reopen", () => {
    const dir = mkdtempSync(join(process.cwd(), "modexa-persist-"));
    tempDirs.push(dir);
    const path = join(dir, "state.sqlite");

    const db = new ModexaDatabase({ path });
    const billing = new BillingService(db);
    billing.registerPlan({
      id: "pro",
      name: "Pro",
      entitlements: [{ feature: "automations", enabled: true }]
    });
    const subscription = billing.createSubscription({
      communityId: "community-persist",
      planId: "pro"
    });
    const automation = new AutomationService(billing, db);
    const created = automation.create({
      communityId: "community-persist",
      name: "Persisted",
      trigger: { type: "interval", intervalSeconds: 60 },
      action: { type: "command", command: "help" }
    });
    db.close();

    const reopened = new ModexaDatabase({ path });
    const billingReloaded = new BillingService(reopened);
    const automationReloaded = new AutomationService(billingReloaded, reopened);

    expect(billingReloaded.getSubscription(subscription.id)?.communityId).toBe("community-persist");
    expect(automationReloaded.get(created.id)?.name).toBe("Persisted");
    reopened.close();
  });

  it("enforces billing entitlements and overrides", () => {
    const billing = new BillingService();
    billing.registerPlan({
      id: "free",
      name: "Free",
      entitlements: [{ feature: "automations", enabled: false }]
    });
    billing.registerPlan({
      id: "pro",
      name: "Pro",
      entitlements: [{ feature: "automations", enabled: true, limit: 50 }]
    });

    const subscription = billing.createSubscription({
      communityId: "community-1",
      planId: "pro"
    });

    expect(billing.hasFeature("community-1", "automations")).toBe(true);
    expect(billing.getFeatureLimit("community-1", "automations")).toBe(50);

    billing.setFeatureOverride({
      subscriptionId: subscription.id,
      feature: "automations",
      enabled: false
    });

    expect(billing.hasFeature("community-1", "automations")).toBe(false);
  });

  it("creates and schedules automations", () => {
    const billing = new BillingService();
    billing.registerPlan({
      id: "pro",
      name: "Pro",
      entitlements: [{ feature: "automations", enabled: true }]
    });
    billing.createSubscription({ communityId: "community-1", planId: "pro" });

    const now = new Date("2026-10-03T10:00:00Z");
    const automations = new AutomationService(billing);
    const item = automations.create({
      communityId: "community-1",
      name: "Daily",
      trigger: { type: "interval", intervalSeconds: 60 },
      action: { type: "command", command: "stats" },
      now
    });

    expect(item.nextRunAt?.getTime()).toBe(now.getTime() + 60_000);
    expect(automations.getDue(new Date("2026-10-03T10:01:00Z"))).toHaveLength(1);
    automations.markRun(item.id, new Date("2026-10-03T10:01:00Z"));
    expect(automations.getDue(new Date("2026-10-03T10:01:00Z"))).toHaveLength(0);
  });

  it("creates moderation cases and adapter actions", () => {
    const moderation = new ModerationService();
    const result = moderation.createCase({
      action: "mute",
      actorUserId: "actor",
      targetUserId: "target",
      communityId: "community-1",
      platform: "discord",
      communityExternalId: "guild-1",
      userExternalId: "user-1",
      durationSeconds: 600,
      reason: "spam"
    });

    expect(result.case.id).toMatch(/^mod_/);
    expect(result.case.status).toBe("pending");
    expect(result.adapterAction.type).toBe("member.mute");
    expect(moderation.getCases("community-1")).toHaveLength(1);
  });

  it("supports bridge endpoint discovery and loop protection", () => {
    const bridge = new BridgeService();
    const tg = bridge.registerEndpoint({
      platform: "telegram",
      communityExternalId: "tg-community",
      communityName: "TG",
      channelExternalId: "tg-channel",
      channelName: "general"
    });
    const dc = bridge.registerEndpoint({
      platform: "discord",
      communityExternalId: "dc-community",
      communityName: "Discord",
      channelExternalId: "dc-channel",
      channelName: "general"
    });

    expect(bridge.listEndpoints()).toHaveLength(2);
    expect(bridge.isLinked(tg.id, dc.id)).toBe(false);
    expect(bridge.isRelayedMessage("\u2063\u200B\u2063hello")).toBe(true);
    expect(bridge.stripRelayMarker("\u2063\u200B\u2063hello")).toBe("hello");
  });

  it("persists identities, communities, roles and command settings in SQLite", () => {
    const dir = mkdtempSync(join(process.cwd(), ".modexa-test-"));
    tempDirs.push(dir);
    const path = join(dir, "modexa.sqlite");

    const db = new ModexaDatabase({ path });
    const identities = new IdentityService(db);
    const communities = new CommunityService(db);
    const user = identities.createUser({ displayName: "Persisted" });
    identities.attachIdentity({
      userId: user.id,
      platform: "telegram",
      externalId: "77",
      username: "persisted"
    });
    const community = communities.createCommunity({ name: "Persisted community" });
    communities.setMode(community.id, "private");
    const memberships = new MembershipService(db);
    memberships.createMembership({
      userId: user.id,
      communityId: community.id
    });

    const settings = new CommandSettingsService(db);
    settings.setEnabled(community.id, "stats", false);

    const reopened = new ModexaDatabase({ path });
    expect(reopened.getUser(user.id)?.displayName).toBe("Persisted");
    expect(reopened.findUserByIdentity("telegram", "77")?.id).toBe(user.id);
    expect(reopened.getCommunitiesSnapshot().some((item) => item.id === community.id && item.mode === "private")).toBe(true);
    expect(reopened.getMembershipsSnapshot(community.id)).toHaveLength(1);
    expect(reopened.isCommandEnabled(community.id, "stats")).toBe(false);
    db.close();
    reopened.close();
  });

  it("enforces command settings at the command service boundary", async () => {
    const dir = mkdtempSync(join(process.cwd(), ".modexa-test-"));
    tempDirs.push(dir);
    const db = new ModexaDatabase({ path: join(dir, "commands.sqlite") });
    const settings = new CommandSettingsService(db);
    const communities = new CommunityService(db);
    const community = communities.createCommunity({ name: "Command settings community" });
    const registry = new CommandRegistry();
    registry.register({
      name: "ping",
      handler: async () => ({ content: "pong" })
    });

    const service = new CommandService(
      new CommandParser(),
      registry,
      undefined,
      settings
    );

    const execution = {
      type: "community" as const,
      platform: "telegram" as const,
      user: { id: "u", displayName: "User", createdAt: new Date(), updatedAt: new Date() },
      community: { id: community.id, name: "Community", mode: "public" as const, createdAt: new Date(), updatedAt: new Date() },
      channel: { id: "ch", communityId: community.id, name: "general", type: "discord_text" as const, platform: "telegram" as const, externalId: "1", createdAt: new Date(), updatedAt: new Date() },
      capabilities: ["commands", "community.view"],
      locale: "ru" as const,
      correlationId: "test"
    };

    settings.setEnabled(community.id, "ping", false);
    const result = await service.handle("/ping", { platform: execution.platform, user: execution.user, community: execution.community, channel: execution.channel, execution }, execution);
    expect(result.response?.content).toContain("отключена");

    settings.setEnabled(community.id, "ping", true);
    const enabled = await service.handle("/ping", { platform: execution.platform, user: execution.user, community: execution.community, channel: execution.channel, execution }, execution);
    expect(enabled.response?.content).toBe("pong");
    db.close();
  });
});
