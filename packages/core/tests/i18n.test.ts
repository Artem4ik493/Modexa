import {
  describe,
  expect,
  it
} from "vitest";

import {
  DEFAULT_LOCALE,
  enMessages,
  resolveLocale,
  ruMessages,
  translate,
  type Locale
} from "../src/index.js";

describe("i18n", () => {
  it("uses Russian by default", () => {
    expect(DEFAULT_LOCALE).toBe("ru");

    expect(
      translate("menu.title")
    ).toBe("Выберите действие:");
  });

  it("translates to English when requested", () => {
    expect(
      translate(
        "menu.title",
        undefined,
        "en"
      )
    ).toBe("Choose an action:");
  });

  it("substitutes parameters", () => {
    expect(
      translate("account.name", {
        name: "Артём"
      })
    ).toBe("Имя: Артём");
  });

  it("keeps unknown placeholders untouched", () => {
    expect(
      translate(
        "account.name",
        { other: "x" },
        "en"
      )
    ).toBe("Name: {name}");
  });

  it("falls back to the default locale for an unknown locale", () => {
    expect(
      translate(
        "menu.back",
        undefined,
        "de" as Locale
      )
    ).toBe("Назад");
  });

  it("resolves platform locale codes", () => {
    expect(resolveLocale("ru-RU")).toBe("ru");
    expect(resolveLocale("en_US")).toBe("en");
    expect(resolveLocale("EN")).toBe("en");
    expect(resolveLocale("uk")).toBe("ru");
    expect(resolveLocale(undefined)).toBe("ru");
  });

  it("keeps Russian and English catalogs in sync", () => {
    const ruKeys = Object.keys(ruMessages).sort();
    const enKeys = Object.keys(enMessages).sort();

    expect(enKeys).toEqual(ruKeys);

    for (const key of ruKeys) {
      const placeholders = (text: string) =>
        (text.match(/\{\w+\}/g) ?? []).sort();

      expect(
        placeholders(
          enMessages[key as keyof typeof enMessages]
        )
      ).toEqual(
        placeholders(
          ruMessages[key as keyof typeof ruMessages]
        )
      );
    }
  });
});