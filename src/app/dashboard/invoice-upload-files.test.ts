import { afterEach, expect, it, vi } from "vitest";
import { DIRECT_INVOICE_UPLOAD_MAX_BYTES } from "@/lib/invoice-import/upload-limits";
import {
  appendInvoiceUploadSource,
  compressInvoiceImage,
  prepareInvoiceUploadSource,
} from "./invoice-upload-files";

const blobMocks = vi.hoisted(() => ({
  upload: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  upload: blobMocks.upload,
}));

function fileOfSize(size: number, name: string, type: string) {
  return new File([new Uint8Array(size)], name, { type });
}

function stubImageCompression(resultSize: number) {
  const close = vi.fn();
  const drawImage = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: 4000,
      height: 3000,
      close,
    })),
  );
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
        callback(
          new Blob([new Uint8Array(resultSize)], { type: "image/jpeg" }),
        );
      }),
    })),
  });

  return { close, drawImage };
}

function stubImageCompressionSequence(resultSizes: number[]) {
  const sizes = [...resultSizes];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: 4000,
      height: 3000,
      close: vi.fn(),
    })),
  );
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
        const size = sizes.shift() ?? DIRECT_INVOICE_UPLOAD_MAX_BYTES + 1;
        callback(new Blob([new Uint8Array(size)], { type: "image/jpeg" }));
      }),
    })),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  blobMocks.upload.mockReset();
});

it("keeps small files on the direct upload path", async () => {
  const file = fileOfSize(512, "invoice.pdf", "application/pdf");
  const source = await prepareInvoiceUploadSource(file, "company-1");
  const formData = new FormData();

  appendInvoiceUploadSource(formData, source);

  expect(source).toEqual({ kind: "file", file });
  expect(formData.get("invoice")).toBe(file);
  expect(formData.get("invoiceBlob")).toBeNull();
  expect(blobMocks.upload).not.toHaveBeenCalled();
});

it("compresses oversized images before choosing the upload path", async () => {
  const { close, drawImage } = stubImageCompression(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES - 1,
  );
  const file = fileOfSize(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 100,
    "invoice.png",
    "image/png",
  );

  const compressed = await compressInvoiceImage(file);

  expect(compressed.name).toBe("invoice.jpg");
  expect(compressed.type).toBe("image/jpeg");
  expect(compressed.size).toBeLessThan(DIRECT_INVOICE_UPLOAD_MAX_BYTES);
  expect(drawImage).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it("tries smaller image dimensions when the first compression is still large", async () => {
  stubImageCompressionSequence([
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 1,
    DIRECT_INVOICE_UPLOAD_MAX_BYTES - 1,
  ]);
  const file = fileOfSize(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 100,
    "invoice",
    "image/jpeg",
  );

  const compressed = await compressInvoiceImage(file);

  expect(compressed.name).toBe("invoice.jpg");
  expect(compressed.size).toBeLessThan(DIRECT_INVOICE_UPLOAD_MAX_BYTES);
});

it("keeps the original image when browser compression cannot shrink it enough", async () => {
  stubImageCompression(DIRECT_INVOICE_UPLOAD_MAX_BYTES + 1);
  const file = fileOfSize(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 100,
    "invoice.png",
    "image/png",
  );

  await expect(compressInvoiceImage(file)).resolves.toBe(file);
});

it("surfaces canvas resize failures", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: 4000,
      height: 3000,
      close: vi.fn(),
    })),
  );
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    })),
  });
  const file = fileOfSize(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 100,
    "invoice.png",
    "image/png",
  );

  await expect(compressInvoiceImage(file)).rejects.toThrow(
    "Could not resize image.",
  );
});

it("uses temporary blob storage when a file still exceeds the direct limit", async () => {
  blobMocks.upload.mockResolvedValue({
    url: "https://blob.test/invoice.pdf",
    downloadUrl: "https://blob.test/invoice.pdf?download=1",
    pathname: "invoice-import/company-1/invoice.pdf",
    contentType: "application/pdf",
    contentDisposition: "",
    etag: "etag",
  });
  const file = fileOfSize(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 100,
    "invoice.pdf",
    "application/pdf",
  );
  const formData = new FormData();

  const source = await prepareInvoiceUploadSource(file, "company-1");
  appendInvoiceUploadSource(formData, source);

  expect(source.kind).toBe("blob");
  expect(formData.get("invoice")).toBeNull();
  expect(String(formData.get("invoiceBlob"))).toContain(
    "invoice-import/company-1/invoice.pdf",
  );
  expect(blobMocks.upload).toHaveBeenCalledWith(
    expect.stringContaining("invoice-import/company-1/"),
    file,
    expect.objectContaining({
      access: "private",
      contentType: "application/pdf",
      handleUploadUrl: "/api/import-invoice/upload",
      multipart: true,
    }),
  );
});

it("sanitizes blob paths and falls back for unknown content types", async () => {
  vi.stubGlobal("crypto", {});
  blobMocks.upload.mockResolvedValue({
    url: "https://blob.test/invoice",
    downloadUrl: "https://blob.test/invoice?download=1",
    pathname: "invoice-import/company_1/invoice",
    contentType: "application/octet-stream",
    contentDisposition: "",
    etag: "etag",
  });
  const file = fileOfSize(
    DIRECT_INVOICE_UPLOAD_MAX_BYTES + 100,
    "bad path",
    "",
  );

  await prepareInvoiceUploadSource(file, "company 1");

  expect(blobMocks.upload).toHaveBeenCalledWith(
    expect.stringContaining("invoice-import/company_1/"),
    file,
    expect.objectContaining({
      contentType: "application/octet-stream",
    }),
  );
});

it("rejects files above the temporary storage limit", async () => {
  const file = fileOfSize(26 * 1024 * 1024, "huge.pdf", "application/pdf");

  await expect(prepareInvoiceUploadSource(file, "company-1")).rejects.toThrow(
    "Use a file under 25 MB.",
  );
  expect(blobMocks.upload).not.toHaveBeenCalled();
});
