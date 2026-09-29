import {
  describe,
  expect,
  it
} from "vitest";

import {
  CoreLogger,
  createCorrelationId,
  createDiagnosticContext
} from "../src/diagnostics/index.js";

describe("diagnostics", () => {
  it("creates correlation ids", () => {
    const first =
      createCorrelationId();

    const second =
      createCorrelationId();

    expect(first).toMatch(
      /^corr-[0-9a-f-]+$/
    );

    expect(second).toMatch(
      /^corr-[0-9a-f-]+$/
    );

    expect(first).not.toBe(
      second
    );
  });

  it("creates diagnostic context", () => {
    const context =
      createDiagnosticContext({
        platform: "telegram",
        adapterId: "telegram-main"
      });

    expect(
      context.correlationId
    ).toMatch(
      /^corr-[0-9a-f-]+$/
    );

    expect(
      context.platform
    ).toBe("telegram");

    expect(
      context.adapterId
    ).toBe("telegram-main");
  });

  it("preserves an existing correlation id", () => {
    const context =
      createDiagnosticContext({
        correlationId: "corr-existing"
      });

    expect(
      context.correlationId
    ).toBe("corr-existing");
  });

  it("emits log entries to handlers", () => {
    const logger =
      new CoreLogger("debug");

    const entries: unknown[] = [];

    logger.addHandler(
      (entry) => {
        entries.push(entry);
      }
    );

    logger.debug(
      "test.debug",
      {
        platform: "telegram"
      }
    );

    logger.info(
      "test.info"
    );

    expect(entries).toHaveLength(2);

    expect(entries[0]).toMatchObject({
      level: "debug",
      message: "test.debug",
      context: {
        platform: "telegram"
      }
    });

    expect(entries[1]).toMatchObject({
      level: "info",
      message: "test.info"
    });
  });

  it("filters entries below minimum level", () => {
    const logger =
      new CoreLogger("info");

    const entries: unknown[] = [];

    logger.addHandler(
      (entry) => {
        entries.push(entry);
      }
    );

    logger.trace("trace");
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(entries).toHaveLength(3);

    expect(
      entries.map(
        (entry: any) =>
          entry.level
      )
    ).toEqual([
      "info",
      "warn",
      "error"
    ]);
  });

  it("stores error information", () => {
    const logger =
      new CoreLogger("error");

    const entries: any[] = [];

    logger.addHandler(
      (entry) => {
        entries.push(entry);
      }
    );

    const error =
      new Error(
        "Something failed"
      );

    logger.error(
      "operation.failed",
      {
        correlationId:
          "corr-test"
      },
      error
    );

    expect(entries).toHaveLength(1);

    expect(
      entries[0].error
    ).toMatchObject({
      name: "Error",
      message:
        "Something failed"
    });

    expect(
      entries[0].context
        .correlationId
    ).toBe(
      "corr-test"
    );
  });
});