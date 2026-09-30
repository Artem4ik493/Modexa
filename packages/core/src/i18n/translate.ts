import {
  DEFAULT_LOCALE,
  type Locale
} from "./locale.js";

import {
  catalogs,
  type MessageKey
} from "./messages.js";

export type MessageParams = Record<
  string,
  string | number
>;

export function translate(
  key: MessageKey,
  params?: MessageParams,
  locale: Locale = DEFAULT_LOCALE
): string {
  const template =
    catalogs[locale]?.[key] ??
    catalogs[DEFAULT_LOCALE][key];

  if (!params) {
    return template;
  }

  return template.replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) =>
      name in params
        ? String(params[name])
        : placeholder
  );
}

export type Translator = (
  key: MessageKey,
  params?: MessageParams
) => string;

export function createTranslator(
  locale?: Locale
): Translator {
  return (key, params) =>
    translate(
      key,
      params,
      locale ?? DEFAULT_LOCALE
    );
}