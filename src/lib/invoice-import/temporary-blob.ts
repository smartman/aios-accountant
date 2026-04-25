import { del, get } from "@vercel/blob";
import { INVOICE_IMPORT_BLOB_PREFIX } from "./upload-limits";
import {
  getMimeType,
  getSafeInvoiceFilename,
  validateInvoiceFile,
} from "./route-support";

export interface TemporaryInvoiceBlob {
  url: string;
  pathname: string;
  contentType: string;
  filename: string;
  size: number;
}

export interface InvoiceUploadContent {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  cleanup: () => Promise<void>;
}

function parseBlobJson(value: string): TemporaryInvoiceBlob {
  try {
    return JSON.parse(value) as TemporaryInvoiceBlob;
  } catch {
    throw new Error("Uploaded invoice reference is invalid.");
  }
}

function validateTemporaryInvoiceBlob(
  value: FormDataEntryValue | null,
): TemporaryInvoiceBlob | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const blob = parseBlobJson(value);
  if (
    typeof blob.url !== "string" ||
    typeof blob.pathname !== "string" ||
    typeof blob.contentType !== "string" ||
    typeof blob.filename !== "string" ||
    typeof blob.size !== "number" ||
    blob.size <= 0 ||
    !blob.pathname.startsWith(INVOICE_IMPORT_BLOB_PREFIX)
  ) {
    throw new Error("Uploaded invoice reference is invalid.");
  }

  if (
    blob.contentType !== "application/pdf" &&
    !blob.contentType.startsWith("image/")
  ) {
    throw new Error("Only PDF and image invoices are supported right now.");
  }

  return blob;
}

async function bufferFromStream(stream: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function loadTemporaryInvoiceBlob(
  blob: TemporaryInvoiceBlob,
): Promise<InvoiceUploadContent> {
  const result = await get(blob.pathname, {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode !== 200) {
    throw new Error("Uploaded invoice could not be loaded.");
  }

  return {
    buffer: await bufferFromStream(result.stream),
    filename: blob.filename,
    mimeType: blob.contentType,
    cleanup: () => del(blob.pathname),
  };
}

export async function readInvoiceUploadContent(
  formData: FormData,
): Promise<InvoiceUploadContent> {
  const file = formData.get("invoice");
  if (file instanceof File) {
    validateInvoiceFile(file);
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: getSafeInvoiceFilename(file),
      mimeType: getMimeType(file),
      cleanup: async () => {},
    };
  }

  const blob = validateTemporaryInvoiceBlob(formData.get("invoiceBlob"));
  if (!blob) {
    throw new Error("Missing invoice file.");
  }

  return loadTemporaryInvoiceBlob(blob);
}

export async function cleanupTemporaryInvoiceBlobReference(formData: FormData) {
  const blob = validateTemporaryInvoiceBlob(formData.get("invoiceBlob"));
  if (blob) {
    await del(blob.pathname);
  }
}
