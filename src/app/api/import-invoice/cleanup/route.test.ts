import { afterEach, expect, it, vi } from "vitest";

const cleanupMock = vi.hoisted(() => ({
  cleanupExpiredTemporaryInvoiceBlobs: vi.fn(),
}));

vi.mock("@/lib/invoice-import/temporary-blob-cleanup", () => cleanupMock);

function request(secret = "secret") {
  return new Request("http://localhost/api/import-invoice/cleanup", {
    headers: {
      authorization: `Bearer ${secret}`,
    },
  });
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  cleanupMock.cleanupExpiredTemporaryInvoiceBlobs.mockReset();
  delete process.env.CRON_SECRET;
});

it("requires the cron secret authorization header", async () => {
  process.env.CRON_SECRET = "secret";
  const { GET } = await import("./route");

  const response = await GET(request("wrong"));

  expect(response.status).toBe(401);
  expect(
    cleanupMock.cleanupExpiredTemporaryInvoiceBlobs,
  ).not.toHaveBeenCalled();
});

it("requires CRON_SECRET to be configured", async () => {
  const { GET } = await import("./route");

  const response = await GET(request());

  expect(response.status).toBe(401);
});

it("runs expired upload cleanup for authorized cron requests", async () => {
  process.env.CRON_SECRET = "secret";
  cleanupMock.cleanupExpiredTemporaryInvoiceBlobs.mockResolvedValue({
    scanned: 3,
    deleted: 2,
    cutoffIso: "2026-04-25T11:00:00.000Z",
  });
  const { GET } = await import("./route");

  const response = await GET(request());
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(payload).toEqual({
    scanned: 3,
    deleted: 2,
    cutoffIso: "2026-04-25T11:00:00.000Z",
  });
});
