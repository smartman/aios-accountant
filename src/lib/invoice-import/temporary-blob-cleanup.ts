import { del, list } from "@vercel/blob";
import {
  INVOICE_IMPORT_BLOB_PREFIX,
  TEMPORARY_INVOICE_BLOB_TTL_MS,
} from "./upload-limits";

export interface TemporaryInvoiceBlobCleanupResult {
  scanned: number;
  deleted: number;
  cutoffIso: string;
}

function isExpired(uploadedAt: Date, now: Date): boolean {
  return now.getTime() - uploadedAt.getTime() >= TEMPORARY_INVOICE_BLOB_TTL_MS;
}

async function deleteExpiredBatch(pathnames: string[]): Promise<number> {
  if (!pathnames.length) {
    return 0;
  }

  await del(pathnames);
  return pathnames.length;
}

export async function cleanupExpiredTemporaryInvoiceBlobs(
  now = new Date(),
): Promise<TemporaryInvoiceBlobCleanupResult> {
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  do {
    const page = await list({
      cursor,
      limit: 1000,
      prefix: INVOICE_IMPORT_BLOB_PREFIX,
    });
    const expiredPathnames = page.blobs
      .filter((blob) => isExpired(blob.uploadedAt, now))
      .map((blob) => blob.pathname);

    scanned += page.blobs.length;
    deleted += await deleteExpiredBatch(expiredPathnames);
    cursor = page.cursor;
  } while (cursor);

  return {
    scanned,
    deleted,
    cutoffIso: new Date(
      now.getTime() - TEMPORARY_INVOICE_BLOB_TTL_MS,
    ).toISOString(),
  };
}
