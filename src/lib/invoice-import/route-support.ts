import { InvoiceImportDraft } from "../invoice-import-types";
import { normalizeInvoiceImportDraft } from "./normalization";

const BAD_REQUEST_ERRORS = new Set([
  "Missing invoice file.",
  "Only PDF and image invoices are supported right now.",
  "Missing reviewed import draft.",
  "Reviewed import draft is invalid.",
  "Choose a company before importing.",
]);

const CONFLICT_ERRORS = new Set([
  "Connect Merit or SmartAccounts before importing.",
]);
const FORBIDDEN_ERRORS = new Set(["Company access was not found."]);

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function getMimeType(file: File): string {
  return file.type || "application/octet-stream";
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_");
}

export function getSafeInvoiceFilename(file: File): string {
  return sanitizeFilename(file.name || "invoice");
}

export function validateInvoiceFile(file: FormDataEntryValue | null): File {
  if (!(file instanceof File)) {
    throw new Error("Missing invoice file.");
  }

  const mimeType = getMimeType(file);
  if (mimeType !== "application/pdf" && !mimeType.startsWith("image/")) {
    throw new Error("Only PDF and image invoices are supported right now.");
  }

  return file;
}

export function parseImportCompanyId(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Choose a company before importing.");
  }

  return value.trim();
}

export function parseInvoiceImportDraft(
  value: FormDataEntryValue | null,
): InvoiceImportDraft {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing reviewed import draft.");
  }

  try {
    return normalizeInvoiceImportDraft(JSON.parse(value) as InvoiceImportDraft);
  } catch {
    throw new Error("Reviewed import draft is invalid.");
  }
}

export function getInvoiceImportResponseStatus(error: unknown): number {
  const message = toErrorMessage(error);

  if (BAD_REQUEST_ERRORS.has(message)) {
    return 400;
  }

  if (CONFLICT_ERRORS.has(message)) {
    return 409;
  }

  if (FORBIDDEN_ERRORS.has(message)) {
    return 403;
  }

  return 500;
}
