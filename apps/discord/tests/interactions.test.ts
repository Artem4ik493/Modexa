import { describe, expect, it } from "vitest";
import {
  createDiscordCustomId,
  parseDiscordCustomId,
  renderDiscordInteraction
} from "../src/interactions.js";

describe("Discord interaction renderer", () => {
  it("round-trips callback tokens and builds action rows", () => {
    const id = createDiscordCustomId("abc123");
    expect(parseDiscordCustomId(id)).toBe("abc123");

    const rows = renderDiscordInteraction({
      content: "hello",
      buttons: [
        {
          id: "ok",
          label: "OK",
          token: "abc123",
          action: { type: "callback", data: "menu.close" }
        },
        {
          id: "docs",
          label: "Docs",
          action: { type: "link", url: "https://example.com" }
        }
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.components).toHaveLength(2);
    expect(rows?.[0]?.components[0]?.custom_id).toBe("mx:abc123");
  });

  it("rejects more than 25 buttons", () => {
    expect(() =>
      renderDiscordInteraction({
        buttons: Array.from({ length: 26 }, (_, index) => ({
          id: String(index),
          label: String(index),
          token: String(index),
          action: { type: "callback" as const, data: "x" }
        }))
      })
    ).toThrow(/25 buttons/);
  });
});
