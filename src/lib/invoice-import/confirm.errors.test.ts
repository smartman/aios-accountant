import { expect, it, vi } from "vitest";
import { confirmInvoiceImport } from "./confirm";
import { buildDraft, buildSavedConnection } from "./confirm.test-support";

it("rethrows vendor creation errors when no fallback vendor can be found", async () => {
  const draft = buildDraft();
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue(null),
    createVendor: vi.fn().mockRejectedValue(new Error("Vendor already exists")),
    findExistingInvoice: vi.fn(),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  };

  await expect(
    confirmInvoiceImport({
      savedConnection: buildSavedConnection(),
      activities: activities as never,
      credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
      mimeType: "image/png",
      filename: "invoice.png",
      buffer: Buffer.from("invoice"),
      draft,
    }),
  ).rejects.toThrow("Vendor already exists");
});

it("throws when an existing-article row has no final article selection", async () => {
  const draft = buildDraft();
  draft.rows[0].selectedArticleCode = null;
  draft.rows[0].selectedArticleDescription = null;
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn().mockRejectedValue(new Error("Vendor already exists")),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  };

  await expect(
    confirmInvoiceImport({
      savedConnection: buildSavedConnection(),
      activities: activities as never,
      credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
      mimeType: "image/png",
      filename: "invoice.png",
      buffer: Buffer.from("invoice"),
      draft,
    }),
  ).rejects.toThrow("Row 1 must select an accounting article.");
});

it("throws when an article code exists without a description", async () => {
  const draft = buildDraft();
  draft.rows[0].selectedArticleCode = "vv";
  draft.rows[0].selectedArticleDescription = null;
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn().mockRejectedValue(new Error("Vendor already exists")),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  };

  await expect(
    confirmInvoiceImport({
      savedConnection: buildSavedConnection(),
      activities: activities as never,
      credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
      mimeType: "image/png",
      filename: "invoice.png",
      buffer: Buffer.from("invoice"),
      draft,
    }),
  ).rejects.toThrow("Row 1 is missing an accounting article.");
});

it("throws when an article description exists without a code", async () => {
  const draft = buildDraft();
  draft.rows[0].selectedArticleCode = null;
  draft.rows[0].selectedArticleDescription = "Väikevahendid kuluks";
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn().mockRejectedValue(new Error("Vendor already exists")),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  };

  await expect(
    confirmInvoiceImport({
      savedConnection: buildSavedConnection(),
      activities: activities as never,
      credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
      mimeType: "image/png",
      filename: "invoice.png",
      buffer: Buffer.from("invoice"),
      draft,
    }),
  ).rejects.toThrow("Row 1 must select an accounting article.");
});

it("throws when a stale draft still requests article creation", async () => {
  const draft = buildDraft();
  draft.rows[0].articleDecision = "create";
  draft.rows[0].newArticle.code = "FURNITURE";
  draft.rows[0].newArticle.description = "Furniture";
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn().mockRejectedValue(new Error("Vendor already exists")),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  };

  await expect(
    confirmInvoiceImport({
      savedConnection: buildSavedConnection(),
      activities: activities as never,
      credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
      mimeType: "image/png",
      filename: "invoice.png",
      buffer: Buffer.from("invoice"),
      draft,
    }),
  ).rejects.toThrow(
    "Row 1 must select an accounting article. In-app article creation is no longer supported.",
  );
  expect(activities.createArticle).not.toHaveBeenCalled();
});
