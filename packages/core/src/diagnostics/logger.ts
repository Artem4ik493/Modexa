import type {
  LogContext,
  LogEntry,
  LogHandler,
  Logger
} from "./types.js";

export class CoreLogger
  implements Logger
{
  private readonly handlers: LogHandler[] = [];

  constructor(
    private readonly minimumLevel: LogEntry["level"] = "info"
  ) {}

  addHandler(
    handler: LogHandler
  ): void {
    this.handlers.push(handler);
  }

  trace(
    message: string,
    context?: LogContext
  ): void {
    this.write(
      "trace",
      message,
      context
    );
  }

  debug(
    message: string,
    context?: LogContext
  ): void {
    this.write(
      "debug",
      message,
      context
    );
  }

  info(
    message: string,
    context?: LogContext
  ): void {
    this.write(
      "info",
      message,
      context
    );
  }

  warn(
    message: string,
    context?: LogContext
  ): void {
    this.write(
      "warn",
      message,
      context
    );
  }

  error(
    message: string,
    context?: LogContext,
    error?: unknown
  ): void {
    const entry: LogEntry = {
      level: "error",
      message,
      timestamp: new Date(),
      context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            }
          : error !== undefined
            ? {
                name: "UnknownError",
                message: String(error)
              }
            : undefined
    };

    this.emit(entry);
  }

  private write(
    level: LogEntry["level"],
    message: string,
    context?: LogContext
  ): void {
    if (
      this.getLevelValue(level) <
      this.getLevelValue(
        this.minimumLevel
      )
    ) {
      return;
    }

    this.emit({
      level,
      message,
      timestamp: new Date(),
      context
    });
  }

  private emit(
    entry: LogEntry
  ): void {
    for (
      const handler of this.handlers
    ) {
      handler(entry);
    }
  }

  private getLevelValue(
    level: LogEntry["level"]
  ): number {
    switch (level) {
      case "trace":
        return 0;

      case "debug":
        return 1;

      case "info":
        return 2;

      case "warn":
        return 3;

      case "error":
        return 4;
    }
  }
}