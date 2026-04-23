import { expect, it, vi } from "vitest";
import { confirmInvoiceImport } from "./confirm";
import { buildDraft, buildSavedConnection } from "./confirm.test-support";

it("returns the first validation error before loading provider state", async () => {
  const draft = buildDraft();
  draft.vendor.name = "";
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
  ).rejects.toThrow("Vendor name is required.");
  expect(activities.loadContext).not.toHaveBeenCalled();
});

it("falls back to an existing vendor when createVendor reports a duplicate", async () => {
  const draft = buildDraft();
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [{ type: "BANK", name: "LHV", currency: "EUR" }],
      },
    }),
    findVendor: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn().mockRejectedValue(new Error("Vendor already exists")),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createPurchaseInvoice: vi.fn().mockResolvedValue({
      invoiceId: "invoice-1",
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

  expect(activities.createVendor).toHaveBeenCalledOnce();
  expect(activities.findVendor).toHaveBeenCalledTimes(2);
  expect(activities.createPurchaseInvoice).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      vendorId: "vendor-existing",
    }),
    expect.anything(),
  );
  expect(result.vendorId).toBe("vendor-existing");
  expect(result.createdVendor).toBe(false);
});

it("returns an existing invoice result when a duplicate is found", async () => {
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
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn(),
    findExistingInvoice: vi
      .fn()
      .mockResolvedValue({ invoiceId: "invoice-existing" }),
    createPurchaseInvoice: vi.fn(),
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

  expect(activities.findVendor).toHaveBeenCalledOnce();
  expect(activities.createVendor).not.toHaveBeenCalled();
  expect(activities.createPurchaseInvoice).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    alreadyExisted: true,
    invoiceId: "invoice-existing",
    vendorId: "vendor-existing",
  });
});

it("preserves exact extraction amounts before provider payload creation", async () => {
  const draft = buildDraft();
  draft.invoice.amountExcludingVat = 120.444;
  draft.invoice.vatAmount = 26.445;
  draft.invoice.totalAmount = 146.889;
  draft.payment.paymentAmount = 146.889;
  draft.rows[0].quantity = 3;
  draft.rows[0].price = 0.3333;
  draft.rows[0].sum = null;

  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4004", type: "EXPENSE", label: "4004 - Assets" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22%" }],
        paymentAccounts: [{ type: "BANK", name: "LHV", currency: "EUR" }],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-existing",
      vendorName: "Office Supplies OU",
    }),
    createVendor: vi.fn(),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    createPurchaseInvoice: vi.fn().mockResolvedValue({
      invoiceId: "invoice-1",
      attachedFile: true,
    }),
    createPayment: vi.fn().mockResolvedValue({
      paymentId: "payment-1",
      paymentAccount: { type: "BANK", name: "LHV" },
    }),
    attachDocument: vi.fn(),
  };

  await confirmInvoiceImport({
    savedConnection: buildSavedConnection(),
    activities: activities as never,
    credentials: { apiId: "merit-id", apiKey: "merit-key" } as never,
    mimeType: "image/png",
    filename: "invoice.png",
    buffer: Buffer.from("invoice"),
    draft,
  });

  expect(activities.findExistingInvoice).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      extraction: expect.objectContaining({
        invoice: expect.objectContaining({
          amountExcludingVat: 120.444,
          vatAmount: 26.445,
          totalAmount: 146.889,
        }),
        payment: expect.objectContaining({
          paymentAmount: 146.889,
        }),
      }),
    }),
    expect.anything(),
  );
  expect(activities.createPurchaseInvoice).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      rows: [
        expect.objectContaining({
          quantity: 3,
          price: 0.3333,
          sum: undefined,
        }),
      ],
    }),
    expect.anything(),
  );
});
