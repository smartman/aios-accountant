import { afterEach, expect, it, vi } from "vitest";
import {
  cleanupTemporaryInvoiceBlobReference,
  readInvoiceUploadContent,
} from "./temporary-blob";

const blobMocks = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: blobMocks.del,
  get: blobMocks.get,
}));

function streamFromText(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function formDataWithBlobReference(overrides?: Record<string, unknown>) {
  const formData = new FormData();
  formData.set(
    "invoiceBlob",
    JSON.stringify({
      url: "https://blob.test/invoice.pdf",
      pathname: "invoice-import/company-1/invoice.pdf",
      filename: "invoice.pdf",
      contentType: "application/pdf",
      size: 5000000,
      ...overrides,
    }),
  );
  return formData;
}

afterEach(() => {
  vi.restoreAllMocks();
  blobMocks.del.mockReset();
  blobMocks.get.mockReset();
});

it("reads direct invoice files from form data", async () => {
  const formData = new FormData();
  formData.set(
    "invoice",
    new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
  );

  const content = await readInvoiceUploadContent(formData);
  await content.cleanup();

  expect(content.buffer.toString()).toBe("invoice");
  expect(content.filename).toBe("invoice.pdf");
  expect(content.mimeType).toBe("application/pdf");
  expect(blobMocks.get).not.toHaveBeenCalled();
  expect(blobMocks.del).not.toHaveBeenCalled();
});

it("loads and deletes temporary blob invoice files", async () => {
  blobMocks.get.mockResolvedValue({
    statusCode: 200,
    stream: streamFromText("blob invoice"),
    blob: { contentType: "application/pdf" },
  });

  const content = await readInvoiceUploadContent(formDataWithBlobReference());
  await content.cleanup();

  expect(content.buffer.toString()).toBe("blob invoice");
  expect(content.filename).toBe("invoice.pdf");
  expect(blobMocks.get).toHaveBeenCalledWith(
    "invoice-import/company-1/invoice.pdf",
    {
      access: "private",
      useCache: false,
    },
  );
  expect(blobMocks.del).toHaveBeenCalledWith(
    "invoice-import/company-1/invoice.pdf",
  );
});

it("cleans up blob references without loading the file", async () => {
  await cleanupTemporaryInvoiceBlobReference(formDataWithBlobReference());

  expect(blobMocks.del).toHaveBeenCalledWith(
    "invoice-import/company-1/invoice.pdf",
  );
  expect(blobMocks.get).not.toHaveBeenCalled();
});

it("rejects missing, invalid, or unavailable invoice uploads", async () => {
  await expect(readInvoiceUploadContent(new FormData())).rejects.toThrow(
    "Missing invoice file.",
  );

  const textFormData = new FormData();
  textFormData.set("invoice", new File(["text"], "invoice.txt"));
  await expect(readInvoiceUploadContent(textFormData)).rejects.toThrow(
    "Only PDF and image invoices are supported right now.",
  );

  await expect(
    readInvoiceUploadContent(formDataWithBlobReference({ pathname: "other" })),
  ).rejects.toThrow("Uploaded invoice reference is invalid.");

  const invalidJsonFormData = new FormData();
  invalidJsonFormData.set("invoiceBlob", "{");
  await expect(readInvoiceUploadContent(invalidJsonFormData)).rejects.toThrow(
    "Uploaded invoice reference is invalid.",
  );

  await expect(
    readInvoiceUploadContent(
      formDataWithBlobReference({ contentType: "text/plain" }),
    ),
  ).rejects.toThrow("Only PDF and image invoices are supported right now.");

  blobMocks.get.mockResolvedValue(null);
  await expect(
    readInvoiceUploadContent(formDataWithBlobReference()),
  ).rejects.toThrow("Uploaded invoice could not be loaded.");
});
