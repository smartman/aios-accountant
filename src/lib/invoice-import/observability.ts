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
  const payload = {
    category: "invoice-import",
    timestamp: new Date().toISOString(),
    workflow: params.workflow,
    provider: params.provider,
    phase: params.phase,
    status: params.status,
    durationMs: params.durationMs,
    metadata: compactMetadata(params.metadata),
    errorMessage:
      params.status === "error" ? toErrorMessage(params.error) : undefined,
  };

  const logger = params.status === "error" ? console.error : console.info;
  logger(JSON.stringify(payload));
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
