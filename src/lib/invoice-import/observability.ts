import { logger, type LogMetadata } from "@/lib/logger";

type InvoiceImportWorkflow = "preview" | "confirm";
type InvoiceImportProvider = "smartaccounts" | "merit";
type InvoiceImportLogMetadata = Record<
  string,
  boolean | number | string | null | undefined
>;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function compactMetadata(
  metadata: InvoiceImportLogMetadata | undefined,
): Record<string, boolean | number | string | null> | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined,
  ) as Array<[string, boolean | number | string | null]>;

  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function logInvoiceImportEvent(params: {
  workflow: InvoiceImportWorkflow;
  provider: InvoiceImportProvider;
  phase: string;
  status: "success" | "error";
  durationMs?: number;
  metadata?: InvoiceImportLogMetadata;
  error?: unknown;
}): void {
  const metadata = compactMetadata(params.metadata);

  logger[params.status === "error" ? "error" : "info"]({
    category: "invoice-import",
    event: `invoice-import.${params.workflow}.${params.phase}`,
    status: params.status,
    thread: {
      workflow: params.workflow,
      provider: params.provider,
      phase: params.phase,
    },
    durationMs: params.durationMs,
    metadata: metadata as LogMetadata | undefined,
    error:
      params.status === "error"
        ? new Error(toErrorMessage(params.error))
        : null,
  });
}

export async function measureInvoiceImportPhase<T>(params: {
  workflow: InvoiceImportWorkflow;
  provider: InvoiceImportProvider;
  phase: string;
  metadata?: InvoiceImportLogMetadata;
  run: () => Promise<T>;
}): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await params.run();
    logInvoiceImportEvent({
      workflow: params.workflow,
      provider: params.provider,
      phase: params.phase,
      status: "success",
      durationMs: Math.round(performance.now() - startedAt),
      metadata: params.metadata,
    });
    return result;
  } catch (error) {
    logInvoiceImportEvent({
      workflow: params.workflow,
      provider: params.provider,
      phase: params.phase,
      status: "error",
      durationMs: Math.round(performance.now() - startedAt),
      metadata: params.metadata,
      error,
    });
    throw error;
  }
}
