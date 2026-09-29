export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error";

export interface LogContext {
  correlationId?: string;
  platform?: string;
  adapterId?: string;
  userId?: string;
  communityId?: string;
  channelId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface Logger {
  trace(
    message: string,
    context?: LogContext
  ): void;

  debug(
    message: string,
    context?: LogContext
  ): void;

  info(
    message: string,
    context?: LogContext
  ): void;

  warn(
    message: string,
    context?: LogContext
  ): void;

  error(
    message: string,
    context?: LogContext,
    error?: unknown
  ): void;
}

export type LogHandler = (
  entry: LogEntry
) => void;