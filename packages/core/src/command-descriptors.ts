import type { CommandRegistry } from "./commands.js";

import {
  SUPPORTED_LOCALES,
  type Locale
} from "./i18n/locale.js";

import { translate } from "./i18n/translate.js";

export interface CommandDescriptor {
  /**
   * Lowercase command name without the slash.
   */
  name: string;

  /**
   * Lowercase aliases without the slash.
   */
  aliases: string[];

  descriptions: Record<Locale, string>;
}

/**
 * Platform-agnostic description of registered commands,
 * used by adapters to register native command menus.
 */
export function listCommandDescriptors(
  registry: CommandRegistry
): CommandDescriptor[] {
  return registry.list().map((command) => {
    const descriptions = {} as Record<
      Locale,
      string
    >;

    for (const locale of SUPPORTED_LOCALES) {
      descriptions[locale] =
        command.descriptionKey
          ? translate(
              command.descriptionKey,
              undefined,
              locale
            )
          : (command.description ??
            translate(
              "help.no_description",
              undefined,
              locale
            ));
    }

    return {
      name: command.name.toLowerCase(),
      aliases: (command.aliases ?? []).map(
        (alias) => alias.toLowerCase()
      ),
      descriptions
    };
  });
}