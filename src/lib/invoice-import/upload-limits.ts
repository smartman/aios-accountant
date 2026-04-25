export const DIRECT_INVOICE_UPLOAD_MAX_BYTES = Math.floor(3.8 * 1024 * 1024);
export const MAX_BLOB_INVOICE_UPLOAD_BYTES = 25 * 1024 * 1024;
export const INVOICE_IMPORT_BLOB_PREFIX = "invoice-import/";
export const TEMPORARY_INVOICE_BLOB_TTL_MS = 60 * 60 * 1000;
export const INVOICE_UPLOAD_LIMIT_MESSAGE =
  "Invoice file is too large for this deployment. Use a file under 25 MB.";
export const VERCEL_DIRECT_UPLOAD_LIMIT_MESSAGE =
  "Invoice file is too large for this Vercel deployment. Uploading through temporary storage.";
