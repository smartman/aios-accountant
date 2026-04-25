import { afterEach, expect, it, vi } from "vitest";
import { cleanupExpiredTemporaryInvoiceBlobs } from "./temporary-blob-cleanup";

const blobMocks = vi.hoisted(() => ({
  del: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: blobMocks.del,
  list: blobMocks.list,
}));

function blob(pathname: string, uploadedAt: Date) {
  return {
    url: `https://blob.test/${pathname}`,
    downloadUrl: `https://blob.test/${pathname}?download=1`,
    pathname,
    size: 100,
    uploadedAt,
    etag: "etag",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  blobMocks.del.mockReset();
  blobMocks.list.mockReset();
});

it("deletes only expired temporary invoice blobs across pages", async () => {
  const now = new Date("2026-04-25T12:00:00.000Z");
  blobMocks.list
    .mockResolvedValueOnce({
      blobs: [
        blob(
          "invoice-import/company/old.pdf",
          new Date("2026-04-25T10:59:00Z"),
        ),
        blob(
          "invoice-import/company/new.pdf",
          new Date("2026-04-25T11:30:00Z"),
        ),
      ],
      cursor: "next-page",
      hasMore: true,
    })
    .mockResolvedValueOnce({
      blobs: [
        blob(
          "invoice-import/company/old-2.pdf",
          new Date("2026-04-25T09:00:00Z"),
        ),
      ],
      hasMore: false,
    });

  const result = await cleanupExpiredTemporaryInvoiceBlobs(now);

  expect(result).toEqual({
    scanned: 3,
    deleted: 2,
    cutoffIso: "2026-04-25T11:00:00.000Z",
  });
  expect(blobMocks.list).toHaveBeenNthCalledWith(1, {
    cursor: undefined,
    limit: 1000,
    prefix: "invoice-import/",
  });
  expect(blobMocks.list).toHaveBeenNthCalledWith(2, {
    cursor: "next-page",
    limit: 1000,
    prefix: "invoice-import/",
  });
  expect(blobMocks.del).toHaveBeenCalledWith([
    "invoice-import/company/old.pdf",
  ]);
  expect(blobMocks.del).toHaveBeenCalledWith([
    "invoice-import/company/old-2.pdf",
  ]);
});

it("does not call delete when no expired blobs are found", async () => {
  blobMocks.list.mockResolvedValue({
    blobs: [
      blob("invoice-import/company/new.pdf", new Date("2026-04-25T11:30:00Z")),
    ],
    hasMore: false,
  });

  const result = await cleanupExpiredTemporaryInvoiceBlobs(
    new Date("2026-04-25T12:00:00.000Z"),
  );

  expect(result.deleted).toBe(0);
  expect(blobMocks.del).not.toHaveBeenCalled();
});
