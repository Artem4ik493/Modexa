import {
  describe,
  expect,
  it
} from "vitest";

import {
  BillingService
} from "../src/billing/service.js";

import {
  createBuiltinPlans,
  FREE_PLAN_ID,
  PRO_PLAN_ID
} from "../src/billing/built-in.js";

describe("BillingService", () => {
  const now = new Date(
    "2026-01-01T12:00:00.000Z"
  );

  function createService() {
    const service = new BillingService();

    for (const plan of createBuiltinPlans()) {
      service.registerPlan({
        id: plan.id,
        name: plan.name,
        entitlements: plan.entitlements,
        now
      });
    }

    return service;
  }

  it("registers and returns plans", () => {
    const service = createService();

    expect(
      service.getPlan(FREE_PLAN_ID)?.name
    ).toBe("FREE");

    expect(
      service.getPlan(PRO_PLAN_ID)?.name
    ).toBe("PRO");

    expect(service.getPlans()).toHaveLength(2);
  });

  it("does not allow duplicate plan ids", () => {
    const service = createService();

    expect(() => {
      service.registerPlan({
        id: FREE_PLAN_ID,
        name: "Another Free",
        entitlements: [],
        now
      });
    }).toThrow(
      'Plan "free" already exists'
    );
  });

  it("creates a community subscription", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: FREE_PLAN_ID,
        now
      });

    expect(subscription.id).toBe(
      "subscription-1"
    );

    expect(subscription.communityId).toBe(
      "community-1"
    );

    expect(subscription.planId).toBe(
      FREE_PLAN_ID
    );

    expect(subscription.status).toBe(
      "active"
    );
  });

  it("does not allow two active subscriptions for one community", () => {
    const service = createService();

    service.createSubscription({
      communityId: "community-1",
      planId: FREE_PLAN_ID,
      now
    });

    expect(() => {
      service.createSubscription({
        communityId: "community-1",
        planId: PRO_PLAN_ID,
        now
      });
    }).toThrow(
      'Community "community-1" already has an active subscription'
    );
  });

  it("allows changing an active subscription plan", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: FREE_PLAN_ID,
        now
      });

    const updated =
      service.changePlan(
        subscription.id,
        PRO_PLAN_ID,
        new Date(
          "2026-01-01T13:00:00.000Z"
        )
      );

    expect(updated.planId).toBe(
      PRO_PLAN_ID
    );

    expect(updated.status).toBe(
      "active"
    );
  });

  it("resolves enabled features from the plan", () => {
    const service = createService();

    service.createSubscription({
      communityId: "community-1",
      planId: PRO_PLAN_ID,
      now
    });

    expect(
      service.hasFeature(
        "community-1",
        "automod",
        now
      )
    ).toBe(true);

    expect(
      service.hasFeature(
        "community-1",
        "bridge",
        now
      )
    ).toBe(true);
  });

  it("denies paid features on the free plan", () => {
    const service = createService();

    service.createSubscription({
      communityId: "community-1",
      planId: FREE_PLAN_ID,
      now
    });

    expect(
      service.hasFeature(
        "community-1",
        "automod",
        now
      )
    ).toBe(false);

    expect(
      service.hasFeature(
        "community-1",
        "bridge",
        now
      )
    ).toBe(false);
  });

  it("denies features when a community has no subscription", () => {
    const service = createService();

    expect(
      service.hasFeature(
        "community-1",
        "basic_commands",
        now
      )
    ).toBe(false);
  });

  it("allows MODEXA owner style feature overrides", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: FREE_PLAN_ID,
        now
      });

    service.setFeatureOverride({
      subscriptionId: subscription.id,
      feature: "automod",
      enabled: true
    });

    expect(
      service.hasFeature(
        "community-1",
        "automod",
        now
      )
    ).toBe(true);
  });

  it("allows disabling a plan feature with an override", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: PRO_PLAN_ID,
        now
      });

    service.setFeatureOverride({
      subscriptionId: subscription.id,
      feature: "bridge",
      enabled: false
    });

    expect(
      service.hasFeature(
        "community-1",
        "bridge",
        now
      )
    ).toBe(false);
  });

  it("returns feature limits from overrides", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: FREE_PLAN_ID,
        now
      });

    service.setFeatureOverride({
      subscriptionId: subscription.id,
      feature: "automations",
      enabled: true,
      limit: 5
    });

    expect(
      service.getFeatureLimit(
        "community-1",
        "automations",
        now
      )
    ).toBe(5);
  });

  it("expires a subscription when its expiration date is reached", () => {
    const service = createService();

    service.createSubscription({
      communityId: "community-1",
      planId: PRO_PLAN_ID,
      startsAt: now,
      expiresAt: new Date(
        "2026-01-02T12:00:00.000Z"
      ),
      now
    });

    const afterExpiration = new Date(
      "2026-01-02T12:00:01.000Z"
    );

    expect(
      service.hasFeature(
        "community-1",
        "automod",
        afterExpiration
      )
    ).toBe(false);

    expect(
      service.getCommunitySubscription(
        "community-1",
        afterExpiration
      )?.status
    ).toBe("expired");
  });

  it("cancels an active subscription", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: PRO_PLAN_ID,
        now
      });

    service.cancelSubscription(
      subscription.id,
      new Date(
        "2026-01-01T13:00:00.000Z"
      )
    );

    expect(
      service.hasFeature(
        "community-1",
        "automod",
        new Date(
          "2026-01-01T14:00:00.000Z"
        )
      )
    ).toBe(false);
  });

  it("does not allow an invalid subscription expiration", () => {
    const service = createService();

    expect(() => {
      service.createSubscription({
        communityId: "community-1",
        planId: PRO_PLAN_ID,
        startsAt: now,
        expiresAt: now,
        now
      });
    }).toThrow(
      "Subscription expiration must be after its start"
    );
  });

  it("does not allow negative feature limits", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: PRO_PLAN_ID,
        now
      });

    expect(() => {
      service.setFeatureOverride({
        subscriptionId: subscription.id,
        feature: "automations",
        enabled: true,
        limit: -1
      });
    }).toThrow(
      "Feature limit cannot be negative"
    );
  });

  it("can clear a feature override", () => {
    const service = createService();

    const subscription =
      service.createSubscription({
        communityId: "community-1",
        planId: FREE_PLAN_ID,
        now
      });

    service.setFeatureOverride({
      subscriptionId: subscription.id,
      feature: "bridge",
      enabled: true
    });

    expect(
      service.hasFeature(
        "community-1",
        "bridge",
        now
      )
    ).toBe(true);

    service.clearFeatureOverride(
      subscription.id,
      "bridge"
    );

    expect(
      service.hasFeature(
        "community-1",
        "bridge",
        now
      )
    ).toBe(false);
  });
});