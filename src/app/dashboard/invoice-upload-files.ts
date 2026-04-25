import { upload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import {
  DIRECT_INVOICE_UPLOAD_MAX_BYTES,
  INVOICE_IMPORT_BLOB_PREFIX,
  INVOICE_UPLOAD_LIMIT_MESSAGE,
  MAX_BLOB_INVOICE_UPLOAD_BYTES,
} from "@/lib/invoice-import/upload-limits";

const IMAGE_COMPRESSION_QUALITIES = [0.86, 0.78, 0.7, 0.62] as const;
const INITIAL_IMAGE_LONG_EDGE = 2400;
const IMAGE_LONG_EDGE_REDUCTION = 0.85;

export type InvoiceUploadSource =
  | { kind: "file"; file: File }
  | {
      kind: "blob";
      blob: {
        url: string;
        pathname: string;
        contentType: string;
        filename: string;
        size: number;
      };
    };

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function toJpegFilename(filename: string): string {
  return filename.match(/\.[^.]+$/)
    ? filename.replace(/\.[^.]+$/, ".jpg")
    : `${filename}.jpg`;
}

function safePathSegment(value: string): string {
  return value.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "invoice";
}

function createUploadPath(file: File, companyId: string): string {
  const uniqueId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return [
    INVOICE_IMPORT_BLOB_PREFIX.replace(/\/$/, ""),
    safePathSegment(companyId),
    uniqueId,
    safePathSegment(file.name),
  ].join("/");
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Resize failed.")),
      "image/jpeg",
      quality,
    );
  });
}

function drawImageToCanvas(image: ImageBitmap, maxLongEdge: number) {
  const scale = Math.min(1, maxLongEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not resize image.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function compressInvoiceImage(file: File): Promise<File> {
  if (!isImageFile(file) || file.size <= DIRECT_INVOICE_UPLOAD_MAX_BYTES) {
    return file;
  }

  if (typeof createImageBitmap !== "function") {
    return file;
  }

  const image = await createImageBitmap(file);
  let maxLongEdge = INITIAL_IMAGE_LONG_EDGE;

  try {
    for (const quality of IMAGE_COMPRESSION_QUALITIES) {
      const canvas = drawImageToCanvas(image, maxLongEdge);
      const blob = await canvasToJpegBlob(canvas, quality);

      if (blob.size <= DIRECT_INVOICE_UPLOAD_MAX_BYTES) {
        return new File([blob], toJpegFilename(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }

      maxLongEdge = Math.round(maxLongEdge * IMAGE_LONG_EDGE_REDUCTION);
    }
  } finally {
    image.close();
  }

  return file;
}

function assertBlobUploadSize(file: File) {
  if (file.size > MAX_BLOB_INVOICE_UPLOAD_BYTES) {
    throw new Error(INVOICE_UPLOAD_LIMIT_MESSAGE);
  }
}

async function uploadTemporaryInvoiceBlob(
  file: File,
  companyId: string,
  signal?: AbortSignal,
): Promise<PutBlobResult> {
  return upload(createUploadPath(file, companyId), file, {
    access: "private",
    contentType: file.type || "application/octet-stream",
    handleUploadUrl: "/api/import-invoice/upload",
    clientPayload: JSON.stringify({
      companyId,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
    multipart: true,
    abortSignal: signal,
  });
}

export async function prepareInvoiceUploadSource(
  file: File,
  companyId: string,
  signal?: AbortSignal,
): Promise<InvoiceUploadSource> {
  const uploadFile = await compressInvoiceImage(file);
  if (uploadFile.size <= DIRECT_INVOICE_UPLOAD_MAX_BYTES) {
    return { kind: "file", file: uploadFile };
  }

  assertBlobUploadSize(uploadFile);
  const blob = await uploadTemporaryInvoiceBlob(uploadFile, companyId, signal);
  return {
    kind: "blob",
    blob: {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      filename: uploadFile.name,
      size: uploadFile.size,
    },
  };
}

export function appendInvoiceUploadSource(
  formData: FormData,
  source: InvoiceUploadSource,
) {
  if (source.kind === "file") {
    formData.append("invoice", source.file);
    return;
  }

  formData.append("invoiceBlob", JSON.stringify(source.blob));
}
