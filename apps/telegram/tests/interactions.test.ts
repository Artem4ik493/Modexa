import { describe, expect, it } from "vitest";
import {
  createTelegramCallbackData,
  parseTelegramCallbackData,
  renderTelegramInteraction
} from "../src/interactions.js";

describe("Telegram interaction renderer", () => {
  it("round-trips callback data and renders inline buttons", () => {
    const data = createTelegramCallbackData("abc123");
    expect(parseTelegramCallbackData(data)).toBe("abc123");

    const keyboard = renderTelegramInteraction({
      content: "hello",
      buttons: [
        {
          id: "ok",
          label: "OK",
          token: "abc123",
          action: { type: "callback", data: "menu.close" }
        }
      ]
    });

    expect(keyboard).toBeDefined();
    expect(keyboard?.inline_keyboard.length).toBe(1);
  });

  it("enforces Telegram callback byte limits", () => {
    expect(() => createTelegramCallbackData("я".repeat(40))).toThrow(/64-byte/);
  });
});
