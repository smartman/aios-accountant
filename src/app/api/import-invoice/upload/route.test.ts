import { afterEach, expect, it, vi } from "vitest";
import { DIRECT_INVOICE_UPLOAD_MAX_BYTES } from "@/lib/invoice-import/upload-limits";

const hoisted = vi.hoisted(() => ({
  getUser: vi.fn(),
  handleUpload: vi.fn(),
  requireCompanyForUser: vi.fn(),
}));

vi.mock("@/lib/workos", () => ({
  getUser: hoisted.getUser,
}));
vi.mock("@/lib/companies/repository", () => ({
  requireCompanyForUser: hoisted.requireCompanyForUser,
}));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: hoisted.handleUpload,
}));

function uploadRequest(payload: unknown) {
  return new Request("http://localhost/api/import-invoice/upload", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function clientPayload(size = DIRECT_INVOICE_UPLOAD_MAX_BYTES + 1) {
  return JSON.stringify({
    companyId: "company-1",
    filename: "invoice.pdf",
    contentType: "application/pdf",
    size,
  });
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

it("requires an authenticated user before generating upload tokens", async () => {
  hoisted.getUser.mockResolvedValue({ user: null });
  const { POST } = await import("./route");

  const response = await POST(uploadRequest({}));

  expect(response.status).toBe(401);
});

it("generates scoped client upload tokens for oversized invoices", async () => {
  hoisted.getUser.mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  });
  hoisted.requireCompanyForUser.mockResolvedValue({ id: "company-1" });
  hoisted.handleUpload.mockImplementation(async (options) => {
    await options.onBeforeGenerateToken(
      "invoice-import/company-1/invoice.pdf",
      clientPayload(),
      true,
    );
    return { type: "blob.generate-client-token", clientToken: "token" };
  });
  const { POST } = await import("./route");

  const response = await POST(
    uploadRequest({ type: "blob.generate-client-token" }),
  );
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(payload.clientToken).toBe("token");
  expect(hoisted.requireCompanyForUser).toHaveBeenCalledWith({
    companyId: "company-1",
    user: { id: "user-1", email: "user@example.com" },
  });
});

it("rejects direct-sized uploads from the blob path", async () => {
  hoisted.getUser.mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  });
  hoisted.handleUpload.mockImplementation(async (options) => {
    await options.onBeforeGenerateToken(
      "invoice-import/company-1/invoice.pdf",
      clientPayload(DIRECT_INVOICE_UPLOAD_MAX_BYTES),
      true,
    );
  });
  const { POST } = await import("./route");

  const response = await POST(
    uploadRequest({ type: "blob.generate-client-token" }),
  );
  const payload = await response.json();

  expect(response.status).toBe(400);
  expect(payload.error).toBe("Upload size is invalid.");
});

it("rejects malformed blob token requests", async () => {
  hoisted.getUser.mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  });
  const { POST } = await import("./route");

  for (const [clientPayloadValue, pathname, expectedError] of [
    [null, "invoice-import/company-1/invoice.pdf", "Missing upload payload."],
    [
      JSON.stringify({ companyId: "company-1" }),
      "invoice-import/company-1/invoice.pdf",
      "Upload payload is invalid.",
    ],
    [clientPayload(), "other/company-1/invoice.pdf", "Upload path is invalid."],
  ] as const) {
    hoisted.handleUpload.mockImplementationOnce(async (options) => {
      await options.onBeforeGenerateToken(pathname, clientPayloadValue, true);
    });

    const response = await POST(
      uploadRequest({ type: "blob.generate-client-token" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe(expectedError);
  }
});

it("uses a generic upload error for non-error failures", async () => {
  hoisted.getUser.mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  });
  hoisted.handleUpload.mockRejectedValue("boom");
  const { POST } = await import("./route");

  const response = await POST(
    uploadRequest({ type: "blob.generate-client-token" }),
  );
  const payload = await response.json();

  expect(response.status).toBe(400);
  expect(payload.error).toBe("Upload failed.");
});
