export interface ParsedCommand {
  name: string;
  args: string[];
}

export class CommandParser {
  parse(input: string): ParsedCommand | null {
    const text = input.trim();

    if (!text.startsWith("/")) {
      return null;
    }

    const parts = text.slice(1).trim().split(/\s+/);

    if (!parts[0]) {
      return null;
    }

    const [name, ...args] = parts;

    return {
      name: name.toLowerCase(),
      args
    };
  }
}