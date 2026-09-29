import type { CommunityId } from "../communities/types.js";
import type {
  FeatureEntitlement,
  FeatureKey,
  Plan,
  PlanId,
  Subscription,
  SubscriptionFeatureOverride,
  SubscriptionId,
  SubscriptionStatus
} from "./types.js";

export interface CreatePlanInput {
  id: PlanId;
  name: string;
  entitlements: FeatureEntitlement[];
  now?: Date;
}

export interface CreateSubscriptionInput {
  communityId: CommunityId;
  planId: PlanId;
  startsAt?: Date;
  expiresAt?: Date;
  now?: Date;
}

export interface SetFeatureOverrideInput {
  subscriptionId: SubscriptionId;
  feature: FeatureKey;
  enabled: boolean;
  limit?: number;
}

export class BillingService {
  private readonly plans = new Map<
    PlanId,
    Plan
  >();

  private readonly subscriptions = new Map<
    SubscriptionId,
    Subscription
  >();

  private readonly subscriptionByCommunity =
    new Map<CommunityId, SubscriptionId>();

  private readonly overrides = new Map<
    string,
    SubscriptionFeatureOverride
  >();

  private nextSubscriptionId = 1;

  registerPlan(input: CreatePlanInput): Plan {
    if (this.plans.has(input.id)) {
      throw new Error(
        `Plan "${input.id}" already exists`
      );
    }

    const now = input.now ?? new Date();

    const plan: Plan = {
      id: input.id,
      name: input.name,
      entitlements: [...input.entitlements],
      createdAt: now,
      updatedAt: now
    };

    this.plans.set(plan.id, plan);

    return plan;
  }

  getPlan(planId: PlanId): Plan | undefined {
    return this.plans.get(planId);
  }

  getPlans(): Plan[] {
    return [...this.plans.values()];
  }

  updatePlan(
    planId: PlanId,
    input: {
      name?: string;
      entitlements?: FeatureEntitlement[];
      now?: Date;
    }
  ): Plan {
    const plan = this.plans.get(planId);

    if (!plan) {
      throw new Error(
        `Plan "${planId}" does not exist`
      );
    }

    const now = input.now ?? new Date();

    if (input.name !== undefined) {
      plan.name = input.name;
    }

    if (input.entitlements !== undefined) {
      plan.entitlements = [
        ...input.entitlements
      ];
    }

    plan.updatedAt = now;

    return plan;
  }

  createSubscription(
    input: CreateSubscriptionInput
  ): Subscription {
    const plan = this.plans.get(input.planId);

    if (!plan) {
      throw new Error(
        `Plan "${input.planId}" does not exist`
      );
    }

    const existingSubscriptionId =
      this.subscriptionByCommunity.get(
        input.communityId
      );

    if (existingSubscriptionId) {
      const existingSubscription =
        this.subscriptions.get(
          existingSubscriptionId
        );

      if (
        existingSubscription &&
        existingSubscription.status === "active"
      ) {
        throw new Error(
          `Community "${input.communityId}" already has an active subscription`
        );
      }
    }

    const now = input.now ?? new Date();
    const startsAt = input.startsAt ?? now;

    if (
      input.expiresAt !== undefined &&
      input.expiresAt <= startsAt
    ) {
      throw new Error(
        "Subscription expiration must be after its start"
      );
    }

    const subscription: Subscription = {
      id: `subscription-${this.nextSubscriptionId++}`,
      communityId: input.communityId,
      planId: input.planId,
      status: "active",
      startsAt,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now
    };

    this.subscriptions.set(
      subscription.id,
      subscription
    );

    this.subscriptionByCommunity.set(
      input.communityId,
      subscription.id
    );

    return subscription;
  }

  getSubscription(
    subscriptionId: SubscriptionId
  ): Subscription | undefined {
    return this.subscriptions.get(
      subscriptionId
    );
  }

  getCommunitySubscription(
    communityId: CommunityId,
    now = new Date()
  ): Subscription | undefined {
    const subscriptionId =
      this.subscriptionByCommunity.get(
        communityId
      );

    if (!subscriptionId) {
      return undefined;
    }

    const subscription =
      this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return undefined;
    }

    this.expireIfNeeded(subscription, now);

    return subscription;
  }

  changePlan(
    subscriptionId: SubscriptionId,
    planId: PlanId,
    now = new Date()
  ): Subscription {
    const subscription =
      this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error(
        `Subscription "${subscriptionId}" does not exist`
      );
    }

    if (subscription.status !== "active") {
      throw new Error(
        `Subscription cannot change plan because its status is "${subscription.status}"`
      );
    }

    if (!this.plans.has(planId)) {
      throw new Error(
        `Plan "${planId}" does not exist`
      );
    }

    subscription.planId = planId;
    subscription.updatedAt = now;

    return subscription;
  }

  cancelSubscription(
    subscriptionId: SubscriptionId,
    now = new Date()
  ): Subscription {
    const subscription =
      this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error(
        `Subscription "${subscriptionId}" does not exist`
      );
    }

    if (subscription.status !== "active") {
      throw new Error(
        `Subscription cannot be cancelled because its status is "${subscription.status}"`
      );
    }

    subscription.status = "cancelled";
    subscription.updatedAt = now;

    return subscription;
  }

  expireSubscription(
    subscriptionId: SubscriptionId,
    now = new Date()
  ): Subscription {
    const subscription =
      this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error(
        `Subscription "${subscriptionId}" does not exist`
      );
    }

    subscription.status = "expired";
    subscription.updatedAt = now;

    return subscription;
  }

  setFeatureOverride(
    input: SetFeatureOverrideInput
  ): SubscriptionFeatureOverride {
    const subscription =
      this.subscriptions.get(
        input.subscriptionId
      );

    if (!subscription) {
      throw new Error(
        `Subscription "${input.subscriptionId}" does not exist`
      );
    }

    if (
      input.limit !== undefined &&
      input.limit < 0
    ) {
      throw new Error(
        "Feature limit cannot be negative"
      );
    }

    const override: SubscriptionFeatureOverride = {
      subscriptionId: input.subscriptionId,
      feature: input.feature,
      enabled: input.enabled,
      limit: input.limit
    };

    this.overrides.set(
      this.getOverrideKey(
        input.subscriptionId,
        input.feature
      ),
      override
    );

    return override;
  }

  clearFeatureOverride(
    subscriptionId: SubscriptionId,
    feature: FeatureKey
  ): void {
    this.overrides.delete(
      this.getOverrideKey(
        subscriptionId,
        feature
      )
    );
  }

  getFeatureEntitlement(
    communityId: CommunityId,
    feature: FeatureKey,
    now = new Date()
  ): FeatureEntitlement {
    const subscription =
      this.getCommunitySubscription(
        communityId,
        now
      );

    if (!subscription) {
      return {
        feature,
        enabled: false
      };
    }

    if (subscription.status !== "active") {
      return {
        feature,
        enabled: false
      };
    }

    const override =
      this.overrides.get(
        this.getOverrideKey(
          subscription.id,
          feature
        )
      );

    if (override) {
      return {
        feature,
        enabled: override.enabled,
        limit: override.limit
      };
    }

    const plan = this.plans.get(
      subscription.planId
    );

    if (!plan) {
      return {
        feature,
        enabled: false
      };
    }

    const entitlement =
      plan.entitlements.find(
        (item) => item.feature === feature
      );

    if (!entitlement) {
      return {
        feature,
        enabled: false
      };
    }

    return {
      ...entitlement
    };
  }

  hasFeature(
    communityId: CommunityId,
    feature: FeatureKey,
    now = new Date()
  ): boolean {
    return this.getFeatureEntitlement(
      communityId,
      feature,
      now
    ).enabled;
  }

  getFeatureLimit(
    communityId: CommunityId,
    feature: FeatureKey,
    now = new Date()
  ): number | undefined {
    return this.getFeatureEntitlement(
      communityId,
      feature,
      now
    ).limit;
  }

  private expireIfNeeded(
    subscription: Subscription,
    now: Date
  ): void {
    if (
      subscription.status === "active" &&
      subscription.expiresAt !== undefined &&
      subscription.expiresAt <= now
    ) {
      subscription.status = "expired";
      subscription.updatedAt = now;
    }
  }

  private getOverrideKey(
    subscriptionId: SubscriptionId,
    feature: FeatureKey
  ): string {
    return `${subscriptionId}:${feature}`;
  }
}