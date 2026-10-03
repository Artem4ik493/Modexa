import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type CommandDescriptor,
  type Locale
} from "@modexa/core";

/**
 * Discord locale codes for Modexa locales.
 */
const DISCORD_LOCALE_CODES: Record<
  Locale,
  string
> = {
  ru: "ru",
  en: "en-US"
};

const NAME_PATTERN =
  /^[-_\p{L}\p{N}]{1,32}$/u;

const MAX_DESCRIPTION_LENGTH = 100;

const MAX_COMMANDS = 100;

export interface DiscordSlashCommand {
  name: string;

  description: string;

  descriptionLocalizations?: Record<
    string,
    string
  >;

  options?: Array<{
    name: string;
    description: string;
    type: number;
    required?: boolean;
  }>;
}

function truncate(
  text: string
): string {
  return text.length >
    MAX_DESCRIPTION_LENGTH
    ? `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`
    : text;
}

/**
 * Builds Discord application commands from platform-agnostic
 * command descriptors. The default description uses the
 * default Modexa locale, other locales become localizations.
 * Aliases are registered as separate commands.
 */
export function buildDiscordSlashCommands(
  descriptors: CommandDescriptor[]
): DiscordSlashCommand[] {
  const commands: DiscordSlashCommand[] =
    [];

  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    for (const name of [
      descriptor.name,
      ...descriptor.aliases
    ]) {
      if (seen.has(name)) {
        continue;
      }

      if (!NAME_PATTERN.test(name)) {
        throw new Error(
          `Invalid Discord slash command name: ${name}`
        );
      }

      seen.add(name);

      const localizations: Record<
        string,
        string
      > = {};

      for (const locale of SUPPORTED_LOCALES) {
        if (locale === DEFAULT_LOCALE) {
          continue;
        }

        localizations[
          DISCORD_LOCALE_CODES[locale]
        ] = truncate(
          descriptor.descriptions[locale]
        );
      }

      commands.push({
        name,
        description: truncate(
          descriptor.descriptions[
            DEFAULT_LOCALE
          ]
        ),
        descriptionLocalizations:
          localizations,
        ...(name === "member"
          ? {
              options: [
                {
                  name: "user",
                  description: "Member to inspect",
                  type: 6,
                  required: false
                }
              ]
            }
          : name === "role"
            ? {
                options: [
                  {
                    name: "user",
                    description: "Member",
                    type: 6,
                    required: true
                  },
                  {
                    name: "role",
                    description: "member or moderator",
                    type: 3,
                    required: false
                  }
                ]
              }
            : {})
      });
    }
  }

  if (commands.length > MAX_COMMANDS) {
    throw new Error(
      `Discord allows at most ${MAX_COMMANDS} slash commands`
    );
  }

  return commands;
}