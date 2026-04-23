import { expect, it, vi } from "vitest";
import { confirmInvoiceImport } from "./confirm";
import { buildDraft, buildSavedConnection } from "./confirm.test-support";

it("passes the reviewed payment account selection into payment creation", async () => {
  const draft = buildDraft();
  draft.actions.recordPayment = true;
  draft.payment.paymentAccountName = "Cash desk";
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [
          { type: "BANK", name: "LHV", currency: "EUR" },
          { type: "CASH", name: "Cash desk", currency: "EUR" },
        ],
      },
    }),
    findVendor: vi.fn(),
    createVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-created",
      vendorName: "Office Supplies OU",
    }),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn().mockResolvedValue({
      invoiceId: "invoice-1",
      attachedFile: true,
    }),
    createPayment: vi.fn().mockResolvedValue({
      paymentId: "payment-1",
      paymentAccount: { type: "CASH", name: "Cash desk" },
    }),
    attachDocument: vi.fn(),
  };

  const result = await confirmInvoiceImport({
    savedConnection: buildSavedConnection(),
    activities: activities as never,
    credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
    mimeType: "image/png",
    filename: "invoice.png",
    buffer: Buffer.from("invoice"),
    draft,
  });

  expect(activities.createPayment).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      paymentAccountName: "Cash desk",
    }),
    expect.anything(),
  );
  expect(result.paymentAccount).toEqual({
    type: "CASH",
    name: "Cash desk",
  });
});

it("rejects confirmation when all invoice rows have been removed", async () => {
  const draft = buildDraft();
  draft.rows = [];
  draft.invoice.amountExcludingVat = 0;
  draft.invoice.vatAmount = 0;
  draft.invoice.totalAmount = 0;
  const activities = {
    loadContext: vi.fn(),
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
  ).rejects.toThrow("Invoice must contain at least one row.");
  expect(activities.loadContext).not.toHaveBeenCalled();
});

it("rejects confirmation when a stale draft still requests article creation", async () => {
  const draft = buildDraft();
  draft.invoice.amountExcludingVat = 0;
  draft.invoice.vatAmount = 0;
  draft.invoice.totalAmount = 0;
  draft.rows[0].articleDecision = "create";
  draft.rows[0].selectedArticleCode = null;
  draft.rows[0].selectedArticleDescription = null;
  draft.rows[0].unit = null;
  draft.rows[0].price = null;
  draft.rows[0].sum = null;
  draft.rows[0].taxCode = null;
  draft.rows[0].newArticle.code = "FURNITURE";
  draft.rows[0].newArticle.description = "Furniture";
  draft.rows[0].newArticle.taxCode = null;

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
    createPurchaseInvoice: vi.fn().mockResolvedValue({
      invoiceId: "invoice-2",
      attachedFile: true,
    }),
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
  expect(activities.createPurchaseInvoice).not.toHaveBeenCalled();
});

it("maps null optional row fields to undefined for existing articles", async () => {
  const draft = buildDraft();
  draft.invoice.amountExcludingVat = 0;
  draft.invoice.vatAmount = 0;
  draft.invoice.totalAmount = 0;
  draft.rows[0].unit = null;
  draft.rows[0].price = null;
  draft.rows[0].sum = null;
  draft.rows[0].taxCode = null;

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
    createVendor: vi.fn(),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn(),
    createPurchaseInvoice: vi.fn().mockResolvedValue({
      invoiceId: "invoice-3",
      attachedFile: true,
    }),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  };

  const result = await confirmInvoiceImport({
    savedConnection: buildSavedConnection(),
    activities: activities as never,
    credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
    mimeType: "image/png",
    filename: "invoice.png",
    buffer: Buffer.from("invoice"),
    draft,
  });

  expect(activities.createPurchaseInvoice).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      rows: [
        expect.objectContaining({
          code: "vv",
          unit: undefined,
          price: undefined,
          sum: undefined,
          taxCode: undefined,
        }),
      ],
    }),
    expect.anything(),
  );
  expect(result.invoiceId).toBe("invoice-3");
});
