import {
  describe,
  expect,
  it
} from "vitest";

import {
  parseDiscordCustomId,
  renderDiscordInteraction
} from "./interactions.js";

describe("Discord interactions", () => {
  it("returns undefined for a text-only response", () => {
    expect(
      renderDiscordInteraction({
        content: "Hello"
      })
    ).toBeUndefined();
  });

  it("renders command buttons as compact tokens", () => {
    const rows =
      renderDiscordInteraction({
        buttons: [
          {
            id: "account",
            label: "Account",
            token: "abc123def456",
            action: {
              type: "command",
              command: "/account"
            }
          }
        ]
      });

    expect(rows).toHaveLength(1);

    expect(rows?.[0].type).toBe(1);

    expect(
      rows?.[0].components[0]
    ).toMatchObject({
      type: 2,
      label: "Account",
      custom_id: "mx:abc123def456"
    });
  });

  it("renders link buttons with a url", () => {
    const rows =
      renderDiscordInteraction({
        buttons: [
          {
            id: "website",
            label: "Website",
            action: {
              type: "link",
              url: "https://example.com"
            }
          }
        ]
      });

    expect(
      rows?.[0].components[0]
    ).toMatchObject({
      style: 5,
      url: "https://example.com"
    });

    expect(
      rows?.[0].components[0].custom_id
    ).toBeUndefined();
  });

  it("renders menu options as buttons", () => {
    const rows =
      renderDiscordInteraction({
        menus: [
          {
            id: "plan",
            options: [
              {
                value: "free",
                label: "Free",
                token: "tok-free"
              },
              {
                value: "pro",
                label: "Pro",
                token: "tok-pro"
              }
            ]
          }
        ]
      });

    expect(
      rows?.[0].components.map(
        (button) => button.custom_id
      )
    ).toEqual([
      "mx:tok-free",
      "mx:tok-pro"
    ]);
  });

  it("splits buttons into rows of five", () => {
    const rows =
      renderDiscordInteraction({
        buttons: Array.from(
          { length: 7 },
          (_, index) => ({
            id: `b${index}`,
            label: `B${index}`,
            token: `tok${index}`,
            action: {
              type: "callback" as const,
              data: `d${index}`
            }
          })
        )
      });

    expect(rows).toHaveLength(2);
    expect(rows?.[0].components).toHaveLength(5);
    expect(rows?.[1].components).toHaveLength(2);
  });

  it("rejects more than 25 buttons", () => {
    expect(() =>
      renderDiscordInteraction({
        buttons: Array.from(
          { length: 26 },
          (_, index) => ({
            id: `b${index}`,
            label: `B${index}`,
            token: `tok${index}`,
            action: {
              type: "callback" as const,
              data: `d${index}`
            }
          })
        )
      })
    ).toThrow(
      "Discord message cannot contain more than 25 buttons"
    );
  });

  it("does not render disabled buttons", () => {
    expect(
      renderDiscordInteraction({
        buttons: [
          {
            id: "off",
            label: "Off",
            disabled: true,
            token: "tok-off",
            action: {
              type: "callback",
              data: "off"
            }
          }
        ]
      })
    ).toBeUndefined();
  });

  it("rejects an actionable button without a token", () => {
    expect(() =>
      renderDiscordInteraction({
        buttons: [
          {
            id: "account",
            label: "Account",
            action: {
              type: "callback",
              data: "account"
            }
          }
        ]
      })
    ).toThrow(
      "Interaction button has no token: account"
    );
  });

  it("rejects an oversized custom_id", () => {
    expect(() =>
      renderDiscordInteraction({
        buttons: [
          {
            id: "long",
            label: "Long",
            token: "x".repeat(120),
            action: {
              type: "callback",
              data: "long"
            }
          }
        ]
      })
    ).toThrow(
      "Discord custom_id exceeds 100-character limit"
    );
  });

  it("parses Modexa custom ids", () => {
    expect(
      parseDiscordCustomId("mx:abc")
    ).toBe("abc");

    expect(
      parseDiscordCustomId("other:abc")
    ).toBeUndefined();

    expect(
      parseDiscordCustomId("mx:")
    ).toBeUndefined();

    expect(
      parseDiscordCustomId(undefined)
    ).toBeUndefined();
  });
});