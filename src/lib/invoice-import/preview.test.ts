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
    unit: "pcs",
  });
});

it("falls back to a summarized row and leaves article selection empty when there is no match", async () => {
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
    selectedArticleCode: null,
    unit: null,
    suggestionStatus: "missing",
  });
});

it("skips vendor history loading when the catalog description match is already clear", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction({
      rows: [
        {
          sourceArticleCode: null,
          description: "IT teenused, arvutitarvikud",
          quantity: 1,
          unit: null,
          price: 100,
          sum: 100,
          vatRate: 22,
          vatPc: "VAT22",
          accountPurchase: "4000",
          accountSelectionReason: "IT account.",
        },
      ],
    }) as never,
  );
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - IT" }],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
    }),
    findExistingInvoice: vi.fn().mockResolvedValue(null),
    listArticles: vi.fn().mockResolvedValue([
      {
        code: "it",
        description: "IT teenused, arvutitarvikud",
        purchaseAccountCode: "4000",
      },
    ]),
    getVendorArticleHistory: vi.fn().mockResolvedValue([
      {
        invoiceId: "hist-1",
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
        description: "Old row",
        articleCode: "it",
        articleDescription: "IT teenused, arvutitarvikud",
      },
    ]),
  };

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
    activities: activities as never,
    credentials: {} as never,
    mimeType: "application/pdf",
    filename: "invoice.pdf",
    buffer: Buffer.from("invoice"),
    fingerprint: "abcdef123456",
  });

  expect(preview.draft.rows[0]).toMatchObject({
    selectedArticleCode: "it",
    suggestionStatus: "clear",
  });
  expect(activities.getVendorArticleHistory).not.toHaveBeenCalled();
});

it("loads vendor history when the catalog-only description match is low confidence", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction({
      rows: [
        {
          sourceArticleCode: "MAG 275QF E20",
          description: 'MSI MAG 275QF E20 27" LED WQHD monitor',
          quantity: 1,
          unit: null,
          price: 145.08,
          sum: 145.08,
          vatRate: 24,
          vatPc: null,
          accountPurchase: "it",
          accountSelectionReason: "IT equipment account.",
        },
      ],
    }) as never,
  );
  const activities = {
    loadContext: vi.fn().mockResolvedValue({
      provider: "merit",
      referenceData: {
        accounts: [{ code: "it", type: "EXPENSE", label: "it - IT" }],
        taxCodes: [],
        paymentAccounts: [],
      },
    }),
    findVendor: vi.fn().mockResolvedValue({
      vendorId: "vendor-1",
      vendorName: "ARVUTITARK OÜ",
    }),
    findExistingInvoice: vi.fn().mockResolvedValue({ invoiceId: "dup-1" }),
    listArticles: vi.fn().mockResolvedValue([
      {
        code: "it",
        description: "IT teenused, arvutitarvikud",
        purchaseAccountCode: "it",
      },
    ]),
    getVendorArticleHistory: vi.fn().mockResolvedValue([
      {
        invoiceId: "dup-1",
        vendorId: "vendor-1",
        vendorName: "ARVUTITARK OÜ",
        invoiceNumber: "104026820",
        description: 'MSI MAG 275QF E20 27" LED WQHD monitor',
        articleCode: "it",
        articleDescription: "IT teenused, arvutitarvikud",
        purchaseAccountCode: "it",
      },
    ]),
  };

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
    activities: activities as never,
    credentials: {} as never,
    mimeType: "application/pdf",
    filename: "invoice.pdf",
    buffer: Buffer.from("invoice"),
    fingerprint: "abcdef123456",
  });

  expect(activities.getVendorArticleHistory).toHaveBeenCalledOnce();
  expect(preview.draft.rows[0]).toMatchObject({
    selectedArticleCode: "it",
    suggestionStatus: "clear",
  });
});

it("rounds preview amounts and hides non-actionable vendor warnings", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction({
      invoice: {
        ...buildExtraction().invoice,
        amountExcludingVat: 181.294,
        vatAmount: 39.884,
        totalAmount: 221.178,
      },
      payment: {
        ...buildExtraction().payment,
        paymentAmount: 221.178,
      },
      rows: [
        {
          ...buildExtraction().rows[0],
          price: 36.2097,
          sum: 181.294,
        },
      ],
      warnings: [
        "Buyer block at top left is labeled 'Maksja', vendor was taken from the separately grouped supplier block.",
        "Vendor bankAccount selected as Swedbank IBAN shown on the invoice; multiple supplier bank accounts are listed.",
        "Row totals were rounded from the source document.",
      ],
    }) as never,
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
          paymentAccounts: [
            { type: "BANK", name: "Main bank", currency: "EUR" },
          ],
        },
      }),
      findVendor: vi.fn().mockResolvedValue({
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
      }),
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

  expect(preview.draft.invoice).toMatchObject({
    amountExcludingVat: 181.29,
    vatAmount: 39.88,
    totalAmount: 221.18,
  });
  expect(preview.draft.payment.paymentAmount).toBe(221.18);
  expect(preview.draft.rows[0]).toMatchObject({
    price: 36.21,
    sum: 181.29,
  });
  expect(preview.draft.warnings).toEqual([
    "Row totals were rounded from the source document.",
  ]);
});
