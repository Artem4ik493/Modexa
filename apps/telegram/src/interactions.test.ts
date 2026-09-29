import {
  describe,
  expect,
  it
} from "vitest";

import {
  parseTelegramCallbackData,
  renderTelegramInteraction
} from "./interactions.js";

describe("Telegram interactions", () => {
  it("returns undefined for a text-only response", () => {
    expect(
      renderTelegramInteraction({
        content: "Hello"
      })
    ).toBeUndefined();
  });

  it("renders command buttons as compact tokens", () => {
    const result =
      renderTelegramInteraction({
        content: "Choose an action",
        buttons: [
          {
            id: "account",
            label: "Account",
            token: "abc123def456",
            action: {
              type: "command",
              command: "/account",
              args: ["open"]
            }
          }
        ]
      });

    expect(
      result?.inline_keyboard
    ).toHaveLength(1);

    expect(
      result?.inline_keyboard[0][0]
    ).toHaveProperty(
      "callback_data",
      "mx:abc123def456"
    );
  });

  it("renders callback buttons as compact tokens", () => {
    const result =
      renderTelegramInteraction({
        buttons: [
          {
            id: "settings",
            label: "Settings",
            token: "tok-settings",
            action: {
              type: "callback",
              data: "settings:open"
            }
          }
        ]
      });

    expect(
      result?.inline_keyboard[0][0]
    ).toHaveProperty(
      "callback_data",
      "mx:tok-settings"
    );
  });

  it("renders link buttons as Telegram URLs", () => {
    const result =
      renderTelegramInteraction({
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
      result?.inline_keyboard[0][0]
    ).toHaveProperty(
      "url",
      "https://example.com"
    );
  });

  it("renders menu options with their tokens", () => {
    const result =
      renderTelegramInteraction({
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
      result?.inline_keyboard
    ).toHaveLength(2);

    expect(
      result?.inline_keyboard[0][0]
    ).toHaveProperty(
      "callback_data",
      "mx:tok-free"
    );

    expect(
      result?.inline_keyboard[1][0]
    ).toHaveProperty(
      "callback_data",
      "mx:tok-pro"
    );
  });

  it("does not render disabled buttons", () => {
    expect(
      renderTelegramInteraction({
        buttons: [
          {
            id: "disabled",
            label: "Disabled",
            disabled: true,
            token: "tok-disabled",
            action: {
              type: "callback",
              data: "disabled"
            }
          }
        ]
      })
    ).toBeUndefined();
  });

  it("rejects an actionable button without a token", () => {
    expect(() =>
      renderTelegramInteraction({
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

  it("rejects oversized Telegram callback data", () => {
    expect(() =>
      renderTelegramInteraction({
        buttons: [
          {
            id: "long",
            label: "Long",
            token: "x".repeat(70),
            action: {
              type: "callback",
              data: "long"
            }
          }
        ]
      })
    ).toThrow(
      "Telegram callback_data exceeds 64-byte limit"
    );
  });

  it("parses Modexa callback data", () => {
    expect(
      parseTelegramCallbackData("mx:abc")
    ).toBe("abc");

    expect(
      parseTelegramCallbackData("other:abc")
    ).toBeUndefined();

    expect(
      parseTelegramCallbackData("mx:")
    ).toBeUndefined();

    expect(
      parseTelegramCallbackData(undefined)
    ).toBeUndefined();
  });
});