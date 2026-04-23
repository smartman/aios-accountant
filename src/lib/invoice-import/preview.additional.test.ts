import { expect, it, vi } from "vitest";
import { extractInvoiceWithOpenRouter } from "../openrouter";
import { previewInvoiceImport } from "./preview";

vi.mock("../openrouter", () => ({
  extractInvoiceWithOpenRouter: vi.fn(),
}));

function buildExtraction(overrides?: Record<string, unknown>) {
  return {
    vendor: {
      name: "Vendor OÜ",
      regCode: null,
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
      currency: "USD",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
      notes: null,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-20",
      paymentAmount: 122,
      paymentChannelHint: "CASH",
      reason: null,
    },
    rows: [
      {
        sourceArticleCode: null,
        description: "  ??? special setup fee  ",
        quantity: 1,
        unit: null,
        price: 100,
        sum: 100,
        vatRate: 0,
        vatPc: "VAT0",
        accountPurchase: "4000",
        accountSelectionReason: "Matched default services account.",
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function buildConnection(provider: "smartaccounts" | "merit" = "merit") {
  return {
    workosUserId: "user-1",
    provider,
    credentials:
      provider === "merit"
        ? {
            provider: "merit" as const,
            credentials: { apiId: "merit-id", apiKey: "merit-key" },
          }
        : {
            provider: "smartaccounts" as const,
            credentials: { apiKey: "public", secretKey: "secret" },
          },
    summary: {
      provider,
      label: provider === "merit" ? "Merit" : "SmartAccounts",
      detail: "Verified",
      verifiedAt: new Date().toISOString(),
    },
    verifiedAt: new Date(),
  };
}

it("falls back to the first payment account and derives tax/article labels", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction() as never,
  );

  const preview = await previewInvoiceImport({
    savedConnection: buildConnection(),
    activities: {
      loadContext: vi.fn().mockResolvedValue({
        provider: "merit",
        referenceData: {
          accounts: [
            { code: "4000", type: "EXPENSE", label: "4000 - Services" },
          ],
          taxCodes: [
            { code: "VAT0", rate: null, description: null },
            { code: "VAT22", rate: 22, description: null },
          ],
          paymentAccounts: [
            { type: "BANK", name: "Fallback bank", currency: "EUR" },
          ],
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

  expect(preview.draft.payment.paymentAccountName).toBe("Fallback bank");
  expect(preview.referenceData.taxCodes).toEqual([
    { code: "VAT0", description: "VAT0" },
    { code: "VAT22", description: "VAT22 - 22%" },
  ]);
  expect(preview.draft.rows[0]).toMatchObject({
    selectedArticleCode: null,
    unit: null,
  });
});

it("prefers a same-type payment account when only the currency mismatches", async () => {
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
    buildExtraction({
      payment: {
        isPaid: true,
        paymentDate: "2026-04-20",
        paymentAmount: 122,
        paymentChannelHint: "BANK",
        reason: null,
      },
    }) as never,
  );

  const preview = await previewInvoiceImport({
    savedConnection: buildConnection("smartaccounts"),
    activities: {
      loadContext: vi.fn().mockResolvedValue({
        provider: "smartaccounts",
        referenceData: {
          accounts: [
            { code: "4000", type: "EXPENSE", label: "4000 - Services" },
          ],
          taxCodes: [],
          paymentAccounts: [
            { type: "BANK", name: "GBP bank", currency: "GBP" },
            { type: "CASH", name: "Cashbox", currency: "USD" },
          ],
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

  expect(preview.draft.payment.paymentAccountName).toBe("GBP bank");
});

it("fills empty vendor and invoice fields from preview defaults", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  try {
    vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
      buildExtraction({
        vendor: {
          name: null,
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
          documentType: null,
          invoiceNumber: null,
          referenceNumber: null,
          currency: null,
          issueDate: null,
          dueDate: null,
          entryDate: null,
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
      }) as never,
    );

    const preview = await previewInvoiceImport({
      savedConnection: buildConnection(),
      activities: {
        loadContext: vi.fn().mockResolvedValue({
          provider: "merit",
          referenceData: {
            accounts: [
              { code: "4000", type: "EXPENSE", label: "4000 - Services" },
            ],
            taxCodes: [],
            paymentAccounts: [
              { type: "BANK", name: "Default bank", currency: "EUR" },
            ],
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

    expect(preview.draft.vendor.name).toBe("");
    expect(preview.draft.invoice.invoiceNumber).toBe("AUTO-20260501-ABCDEF12");
    expect(preview.draft.invoice.currency).toBe("EUR");
    expect(preview.draft.invoice.issueDate).toBe("");
    expect(preview.draft.payment.paymentAccountName).toBe("Default bank");
  } finally {
    vi.useRealTimers();
  }
});
