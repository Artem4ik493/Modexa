export type Locale =
  | "ru"
  | "en";

export const DEFAULT_LOCALE: Locale =
  "ru";

export const SUPPORTED_LOCALES: readonly Locale[] =
  ["ru", "en"];

/**
 * Maps a platform locale code such as "ru-RU",
 * "en_US" or "uk" to a supported Modexa locale.
 * Unsupported or missing codes fall back to
 * the default locale.
 */
export function resolveLocale(
  code: string | undefined
): Locale {
  if (!code) {
    return DEFAULT_LOCALE;
  }

  const language = code
    .toLowerCase()
    .split(/[-_]/)[0];

  return (
    SUPPORTED_LOCALES.find(
      (locale) => locale === language
    ) ?? DEFAULT_LOCALE
  );
}