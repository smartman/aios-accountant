import { describe, expect, it, vi } from "vitest";

vi.mock("../openrouter", () => ({
  extractInvoiceWithOpenRouter: vi.fn(async () => ({
    vendor: {
      name: "Vendor OÜ",
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: null,
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [],
    warnings: [],
  })),
}));

vi.mock("../provider-import-helpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../provider-import-helpers")>();
  return {
    ...actual,
    resolvePurchaseRows: vi.fn(() => [
      {
        code: "SVC01",
        description: "Service row",
        quantity: undefined,
        unit: undefined,
        price: undefined,
        sum: undefined,
        taxCode: undefined,
        accountCode: "4000",
        accountSelectionReason: "Fallback",
      },
    ]),
  };
});

describe("previewInvoiceImport row null handling", () => {
  it("normalizes undefined resolved row values into review defaults", async () => {
    const { previewInvoiceImport } = await import("./preview");

    const preview = await previewInvoiceImport({
      savedConnection: {
        workosUserId: "user-1",
        provider: "merit",
        credentials: {
          provider: "merit",
          credentials: { apiId: "merit-id", apiKey: "merit-key" },
        },
        summary: {
          provider: "merit",
          label: "Merit",
          detail: "Verified",
          verifiedAt: new Date().toISOString(),
        },
        verifiedAt: new Date(),
      },
      activities: {
        loadContext: vi.fn().mockResolvedValue({
          provider: "merit",
          referenceData: {
            accounts: [
              { code: "4000", type: "EXPENSE", label: "4000 - Services" },
            ],
            taxCodes: [],
            paymentAccounts: [],
          },
        }),
        findVendor: vi.fn().mockResolvedValue(null),
        findExistingInvoice: vi.fn().mockResolvedValue(null),
        listArticles: vi.fn().mockResolvedValue([]),
        getVendorArticleHistory: vi.fn().mockResolvedValue([]),
      } as never,
      credentials: {} as never,
      mimeType: "application/pdf",
      filename: "invoice.pdf",
      buffer: Buffer.from("invoice"),
      fingerprint: "abcdef123456",
    });

    expect(preview.draft.rows[0]).toMatchObject({
      quantity: 1,
      unit: null,
      price: null,
      sum: null,
      taxCode: null,
    });
  });
});
