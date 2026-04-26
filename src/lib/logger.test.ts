import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addLogThreadContext,
  createLogRequestId,
  logger,
  withLogThreadContext,
} from "./logger";

function parseLastLog(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.parse(spy.mock.calls.at(-1)?.[0] as string) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("writes structured info logs with UTC timestamp and thread context", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    withLogThreadContext({ requestId: "request-1" }, () => {
      addLogThreadContext({ userId: "user-1" });
      logger.info({
        category: "test",
        event: "test.info",
        status: "success",
        thread: { companyId: "company-1" },
        metadata: {
          count: 2,
          omitted: undefined,
          cachedInputTokens: 10,
        },
      });
    });

    expect(parseLastLog(infoSpy)).toMatchObject({
      level: "info",
      category: "test",
      event: "test.info",
      status: "success",
      thread: {
        requestId: "request-1",
        userId: "user-1",
        companyId: "company-1",
      },
      metadata: {
        count: 2,
        cachedInputTokens: 10,
      },
    });
    expect(parseLastLog(infoSpy).timestamp).toMatch(/Z$/);
  });

  it("redacts credentials and serializes errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error({
      category: "test",
      event: "test.error",
      status: "error",
      metadata: {
        apiKey: "secret",
        nested: {
          accessToken: "secret",
          values: [{ refreshToken: "secret" }, { visible: "ok" }],
        },
      },
      error: new TypeError("Broken"),
    });

    expect(parseLastLog(errorSpy)).toMatchObject({
      level: "error",
      metadata: {
        apiKey: "[redacted]",
        nested: {
          accessToken: "[redacted]",
          values: [{ refreshToken: "[redacted]" }, { visible: "ok" }],
        },
      },
      error: {
        name: "TypeError",
        message: "Broken",
      },
    });
  });

  it("supports warn, debug, primitive errors, and request ids", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    addLogThreadContext({ requestId: "outside-context" });
    logger.debug({
      category: "test",
      event: "test.debug",
      error: "plain failure",
    });
    logger.warn({
      category: "test",
      event: "test.warn",
      durationMs: 12,
    });

    expect(parseLastLog(infoSpy)).toMatchObject({
      level: "debug",
      error: {
        message: "plain failure",
      },
    });
    expect(parseLastLog(warnSpy)).toMatchObject({
      level: "warn",
      durationMs: 12,
    });
    expect(createLogRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
