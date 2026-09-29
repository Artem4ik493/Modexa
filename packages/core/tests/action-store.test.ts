import {
  describe,
  expect,
  it
} from "vitest";

import {
  InteractionActionStore
} from "../src/index.js";

describe("InteractionActionStore", () => {
  const now = new Date(
    "2026-01-01T12:00:00.000Z"
  );

  const scope = {
    userId: "user-1",
    platform: "telegram"
  };

  const requester = {
    userId: "user-1",
    platform: "telegram"
  };

  it("creates a compact token and resolves the stored action", () => {
    const store =
      new InteractionActionStore();

    const token = store.create({
      action: {
        type: "command",
        command: "/settings",
        args: ["language", "en"]
      },
      scope,
      now
    });

    expect(token).toMatch(
      /^[0-9a-f]{12}$/
    );

    expect(
      store.resolve(
        token,
        requester,
        now
      )
    ).toEqual({
      status: "ok",
      action: {
        type: "command",
        command: "/settings",
        args: ["language", "en"]
      }
    });
  });

  it("returns not_found for an unknown token", () => {
    const store =
      new InteractionActionStore();

    expect(
      store.resolve(
        "missing",
        requester,
        now
      )
    ).toEqual({
      status: "not_found"
    });
  });

  it("expires tokens after the ttl", () => {
    const store =
      new InteractionActionStore({
        ttlMs: 1000
      });

    const token = store.create({
      action: {
        type: "callback",
        data: "account"
      },
      scope,
      now
    });

    const later = new Date(
      now.getTime() + 1000
    );

    expect(
      store.resolve(
        token,
        requester,
        later
      )
    ).toEqual({
      status: "expired"
    });

    expect(
      store.resolve(
        token,
        requester,
        later
      )
    ).toEqual({
      status: "not_found"
    });
  });

  it("does not let another user use a token", () => {
    const store =
      new InteractionActionStore();

    const token = store.create({
      action: {
        type: "callback",
        data: "account"
      },
      scope,
      now
    });

    expect(
      store.resolve(
        token,
        {
          userId: "user-2",
          platform: "telegram"
        },
        now
      )
    ).toEqual({
      status: "forbidden"
    });
  });

  it("does not let another platform use a token", () => {
    const store =
      new InteractionActionStore();

    const token = store.create({
      action: {
        type: "callback",
        data: "account"
      },
      scope,
      now
    });

    expect(
      store.resolve(
        token,
        {
          userId: "user-1",
          platform: "discord"
        },
        now
      )
    ).toEqual({
      status: "forbidden"
    });
  });

  it("allows any user when the scope has no user", () => {
    const store =
      new InteractionActionStore();

    const token = store.create({
      action: {
        type: "callback",
        data: "public"
      },
      scope: {
        platform: "telegram"
      },
      now
    });

    expect(
      store.resolve(
        token,
        {
          userId: "anyone",
          platform: "telegram"
        },
        now
      ).status
    ).toBe("ok");
  });

  it("prunes expired tokens when creating new ones", () => {
    const store =
      new InteractionActionStore({
        ttlMs: 1000
      });

    store.create({
      action: {
        type: "callback",
        data: "old"
      },
      scope,
      now
    });

    expect(store.size).toBe(1);

    store.create({
      action: {
        type: "callback",
        data: "new"
      },
      scope,
      now: new Date(
        now.getTime() + 5000
      )
    });

    expect(store.size).toBe(1);
  });

  it("binds tokens to command and callback buttons", () => {
    const store =
      new InteractionActionStore();

    const bound = store.bindResponse(
      {
        content: "Choose an action",
        buttons: [
          {
            id: "settings",
            label: "Settings",
            action: {
              type: "command",
              command: "/settings",
              args: ["open"]
            }
          },
          {
            id: "account",
            label: "Account",
            action: {
              type: "callback",
              data: "account"
            }
          }
        ]
      },
      scope,
      now
    );

    expect(bound.content).toBe(
      "Choose an action"
    );

    const [settings, account] =
      bound.buttons ?? [];

    expect(settings.token).toBeDefined();
    expect(account.token).toBeDefined();
    expect(settings.token).not.toBe(
      account.token
    );

    expect(
      store.resolve(
        settings.token!,
        requester,
        now
      )
    ).toEqual({
      status: "ok",
      action: {
        type: "command",
        command: "/settings",
        args: ["open"]
      }
    });

    expect(
      store.resolve(
        account.token!,
        requester,
        now
      )
    ).toEqual({
      status: "ok",
      action: {
        type: "callback",
        data: "account"
      }
    });
  });

  it("does not bind tokens to link or disabled buttons", () => {
    const store =
      new InteractionActionStore();

    const bound = store.bindResponse(
      {
        buttons: [
          {
            id: "website",
            label: "Website",
            action: {
              type: "link",
              url: "https://example.com"
            }
          },
          {
            id: "off",
            label: "Off",
            disabled: true,
            action: {
              type: "callback",
              data: "off"
            }
          }
        ]
      },
      scope,
      now
    );

    expect(
      bound.buttons?.[0].token
    ).toBeUndefined();

    expect(
      bound.buttons?.[1].token
    ).toBeUndefined();

    expect(store.size).toBe(0);
  });

  it("binds tokens to menu options", () => {
    const store =
      new InteractionActionStore();

    const bound = store.bindResponse(
      {
        menus: [
          {
            id: "plan",
            options: [
              {
                value: "free",
                label: "Free"
              },
              {
                value: "pro",
                label: "Pro"
              }
            ]
          }
        ]
      },
      scope,
      now
    );

    const option =
      bound.menus?.[0].options[1];

    expect(option?.value).toBe("pro");

    expect(
      store.resolve(
        option!.token,
        requester,
        now
      )
    ).toEqual({
      status: "ok",
      action: {
        type: "menu",
        menuId: "plan",
        value: "pro"
      }
    });
  });
});