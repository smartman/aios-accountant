import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogPrimitive = boolean | number | string | null;
type LogValue =
  | LogPrimitive
  | LogValue[]
  | { [key: string]: LogValue | undefined }
  | undefined;

export type LogMetadata = Record<string, LogValue>;
export type LogThreadContext = Record<string, LogPrimitive | undefined>;

type LogEventParams = {
  level: LogLevel;
  category: string;
  event: string;
  status?: "success" | "error";
  durationMs?: number;
  thread?: LogThreadContext;
  metadata?: LogMetadata;
  error?: unknown;
};

const logThreadStorage = new AsyncLocalStorage<LogThreadContext>();

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "token" ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.includes("api_key") ||
    normalized.includes("apikey") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("password")
  );
}

function sanitizeError(error: unknown): LogMetadata | undefined {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function sanitizeValue(key: string, value: LogValue): LogValue {
  if (value === undefined) {
    return undefined;
  }

  if (isSensitiveKey(key)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(key, item))
      .filter((item) => item !== undefined) as LogValue[];
  }

  if (typeof value === "object" && value !== null) {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject<T extends LogMetadata | LogThreadContext>(
  object: T | undefined,
): T | undefined {
  if (!object) {
    return undefined;
  }

  const entries = Object.entries(object)
    .map(([key, value]) => [key, sanitizeValue(key, value)] as const)
    .filter(([, value]) => value !== undefined);

  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

function writeLogLine(params: LogEventParams): void {
  const thread = sanitizeObject({
    ...getLogThreadContext(),
    ...params.thread,
  });
  const payload = sanitizeObject({
    timestamp: new Date().toISOString(),
    level: params.level,
    category: params.category,
    event: params.event,
    status: params.status,
    durationMs: params.durationMs,
    thread,
    metadata: sanitizeObject(params.metadata),
    error: sanitizeError(params.error),
  });
  const line = JSON.stringify(payload);

  if (params.level === "error") {
    console.error(line);
    return;
  }

  if (params.level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function createLogRequestId(): string {
  return crypto.randomUUID();
}

export function getLogThreadContext(): LogThreadContext {
  return logThreadStorage.getStore() ?? {};
}

export function addLogThreadContext(context: LogThreadContext): void {
  const current = logThreadStorage.getStore();
  if (!current) {
    return;
  }

  Object.assign(current, sanitizeObject(context));
}

export function withLogThreadContext<T>(
  context: LogThreadContext,
  run: () => T,
): T {
  return logThreadStorage.run(
    {
      ...getLogThreadContext(),
      ...sanitizeObject(context),
    },
    run,
  );
}

export const logger = {
  debug(params: Omit<LogEventParams, "level">): void {
    writeLogLine({ ...params, level: "debug" });
  },
  error(params: Omit<LogEventParams, "level">): void {
    writeLogLine({ ...params, level: "error" });
  },
  info(params: Omit<LogEventParams, "level">): void {
    writeLogLine({ ...params, level: "info" });
  },
  warn(params: Omit<LogEventParams, "level">): void {
    writeLogLine({ ...params, level: "warn" });
  },
};
