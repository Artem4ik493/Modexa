import type {
  LogContext
} from "./types.js";

export interface DiagnosticContext
  extends LogContext {
  correlationId: string;
}

export function createCorrelationId(): string {
  return `corr-${crypto.randomUUID()}`;
}

export function createDiagnosticContext(
  context?: LogContext
): DiagnosticContext {
  return {
    ...context,
    correlationId:
      context?.correlationId ??
      createCorrelationId()
  };
}