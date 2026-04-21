import { expect, it, vi } from "vitest";
import { previewInvoiceImport } from "./preview";
import { extractInvoiceWithOpenRouter } from "../openrouter";

vi.mock("../openrouter", () => ({
  extractInvoiceWithOpenRouter: vi.fn(),
}));

function buildExtraction(overrides?: Record<string, unknown>) {
  return {
    vendor: {
      name: "Vendor OÜ",
      regCode: "12345678",
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: "EE",
      city: "Tallinn",
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
      notes: "office chair",
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-20",
      paymentAmount: 122,
      paymentChannelHint: "BANK",
      reason: null,
    },
    rows: [
      {
        sourceArticleCode: "CHAIR-01",
        description: "Office chair",
        quantity: 1,
        unit: "pcs",
        price: 100,
        sum: 100,
        vatRate: 22,
        vatPc: "VAT22",
        accountPurchase: "4000",
        accountSelectionReason: "Furniture account.",
      },
    ],
    warnings: [],
    ...overrides,
  };
}

it("builds a reviewed draft with candidate suggestions and duplicate info", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction() as never,
  );
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "smartaccounts",
      referenceData: {
        accounts: [
          { code: "4000", type: "EXPENSE", label: "4000 - Furniture" },
        ],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
        paymentAccounts: [{ type: "BANK", name: "Main bank", currency: "EUR" }],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
    }),
    findExistingInvoice: vi.fn().mockResolvedValue({ invoiceId: "dup-1" }),
    listArticles: vi.fn().mockResolvedValue([
      {
        code: "FURNITURE",
        description: "Furniture",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
        unit: "pcs",
      },
    ]),
    getVendorArticleHistory: vi.fn().mockResolvedValue([
      {
        invoiceId: "hist-1",
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
        description: "Office chair",
        articleCode: "FURNITURE",
        articleDescription: "Furniture",
      },
    ]),
  };

  const preview = await previewInvoiceImport({
    savedConnection: {
      workosUserId: "user-1",
      provider: "smartaccounts",
      credentials: {
        provider: "smartaccounts",
        credentials: { apiKey: "public", secretKey: "secret" },
      },
      summary: {
        provider: "smartaccounts",
        label: "SmartAccounts",
        detail: "Verified",
        verifiedAt: new Date().toISOString(),
      },
      verifiedAt: new Date(),
    },
    activities: activities as never,
    credentials: {} as never,
    mimeType: "application/pdf",
    filename: "invoice.pdf",
    buffer: Buffer.from("invoice"),
    fingerprint: "abcdef123456",
  });

  expect(preview.draft.duplicateInvoice).toEqual({
    invoiceId: "dup-1",
    vendorName: "Vendor OÜ",
    invoiceNumber: "INV-1",
  });
  expect(preview.draft.payment.paymentAccountName).toBe("Main bank");
  expect(preview.articleTypeOptions).toEqual(["SERVICE"]);
  expect(preview.unitOptions).toEqual(["pcs"]);
  expect(preview.articleOptions).toEqual([
    {
      code: "FURNITURE",
      description: "Furniture",
      purchaseAccountCode: "4000",
      taxCode: "VAT22",
      type: null,
      unit: "pcs",
    },
  ]);
  expect(preview.sourceArticleOptions).toEqual([
    {
      code: "FURNITURE",
      description: "Furniture",
    },
  ]);
  expect(preview.draft.vendor).toMatchObject({
    selectionMode: "existing",
    existingVendorId: "vendor-1",
    existingVendorName: "Vendor OÜ",
  });
  expect(preview.draft.rows[0]).toMatchObject({
    sourceArticleCode: "CHAIR-01",
    selectedArticleCode: "FURNITURE",
    suggestionStatus: "clear",
    newArticle: expect.objectContaining({
      unit: "pcs",
    }),
  });
});

it("falls back to a summarized row and create-new article when there is no match", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction({ rows: [] }) as never,
  );
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

  expect(preview.draft.rows).toHaveLength(1);
  expect(preview.draft.rows[0]).toMatchObject({
    articleDecision: "existing",
    selectedArticleCode: null,
    newArticle: expect.objectContaining({
      code: "OFFICE_CHAIR",
      unit: "",
    }),
    suggestionStatus: "missing",
  });
});
