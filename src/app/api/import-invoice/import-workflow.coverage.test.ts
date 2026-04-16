import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type {
  AccountingProviderAdapter,
  MeritCredentials,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import type { InvoiceExtraction } from "@/lib/invoice-import-types";
import type { StoredAccountingConnection } from "@/lib/user-accounting-connections";

const hoisted = vi.hoisted(() => ({
  meritFindVendor: vi.fn(),
  smartAccountsFindVendor: vi.fn(),
}));

vi.mock("@/lib/openrouter", () => ({
  extractInvoiceWithOpenRouter: vi.fn(),
}));
vi.mock("@/lib/workos", () => ({
  getUser: vi.fn(),
}));
vi.mock("@/lib/user-accounting-connections", () => ({
  getStoredAccountingConnection: vi.fn(),
}));
vi.mock("@/lib/merit", () => ({
  meritProviderAdapter: {
    loadContext: vi.fn(),
    findOrCreateVendor: vi.fn(),
    findExistingInvoice: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
}));
vi.mock("@/lib/providers/merit/data", () => ({
  findVendor: hoisted.meritFindVendor,
}));
vi.mock("@/lib/smartaccounts", () => ({
  smartAccountsProviderAdapter: {
    loadContext: vi.fn(),
    findOrCreateVendor: vi.fn(),
    findExistingInvoice: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
}));
vi.mock("@/lib/providers/smartaccounts/data", () => ({
  findVendor: hoisted.smartAccountsFindVendor,
}));

function buildExtraction(
  overrides?: Partial<InvoiceExtraction>,
): InvoiceExtraction {
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
      ...overrides?.vendor,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-14",
      dueDate: "2026-04-21",
      entryDate: "2026-04-14",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
      notes: null,
      ...overrides?.invoice,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-14",
      paymentAmount: 122,
      paymentChannelHint: "BANK",
      reason: "Paid by card",
      ...overrides?.payment,
    },
    rows: overrides?.rows ?? [
      {
        description: "Consulting services",
        quantity: 1,
        unit: "pcs",
        price: 100,
        sum: 100,
        vatRate: 22,
        vatPc: "VAT22",
        accountPurchase: "4000",
        accountSelectionReason: "Matched the services expense account.",
      },
    ],
    warnings: overrides?.warnings ?? [],
  };
}

function buildContext() {
  return {
    provider: "smartaccounts" as const,
    referenceData: {
      accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - Services" }],
      taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [
        { type: "BANK" as const, name: "Main bank", currency: "EUR" },
      ],
    },
    raw: {
      accounts: [],
      vatPcs: [],
      bankAccounts: [],
      cashAccounts: [],
      articles: [],
    },
  };
}

function buildSavedConnection(
  provider: "smartaccounts" | "merit",
): StoredAccountingConnection {
  return {
    workosUserId: "user-1",
    provider,
    credentials:
      provider === "smartaccounts"
        ? {
            provider: "smartaccounts",
            credentials: {
              apiKey: "public",
              secretKey: "secret",
            },
          }
        : {
            provider: "merit",
            credentials: {
              apiId: "merit-id",
              apiKey: "merit-key",
            },
          },
    summary: {
      provider,
      label: provider === "smartaccounts" ? "SmartAccounts" : "Merit",
      detail: "Verified",
      verifiedAt: new Date().toISOString(),
    },
    verifiedAt: new Date(),
  };
}

function buildAdapter<TCredentials>(): AccountingProviderAdapter<TCredentials> {
  return {
    provider: "smartaccounts",
    validateCredentials: vi.fn(),
    loadContext: vi.fn(async () => buildContext()),
    findOrCreateVendor: vi.fn(async () => ({
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
      createdVendor: false,
      existingVendor: null,
    })),
    findExistingInvoice: vi.fn(async () => null),
    createPurchaseInvoice: vi.fn(async () => ({
      invoiceId: "invoice-1",
      attachedFile: true,
    })),
    createPayment: vi.fn(async () => ({
      paymentId: "payment-1",
      paymentAccount: { type: "BANK" as const, name: "Main bank" },
    })),
    attachDocument: vi.fn(async () => {}),
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  hoisted.meritFindVendor.mockResolvedValue(null);
  hoisted.smartAccountsFindVendor.mockResolvedValue(null);

  const { extractInvoiceWithOpenRouter } = await import("@/lib/openrouter");
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(buildExtraction());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("import workflow coverage", () => {
  it("skips SmartAccounts vendor lookup when no vendor search term is available", async () => {
    const { importWithAdapter } = await import("./route");
    const { extractInvoiceWithOpenRouter } = await import("@/lib/openrouter");

    vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValueOnce(
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
      }),
    );

    const adapter = buildAdapter<SmartAccountsCredentials>();
    const result = await importWithAdapter({
      savedConnection: buildSavedConnection("smartaccounts"),
      adapter,
      credentials: {
        apiKey: "public",
        secretKey: "secret",
      },
      mimeType: "application/pdf",
      filename: "invoice.pdf",
      buffer: Buffer.from("invoice"),
      fingerprint: "abcdef1234567890",
    });

    expect(hoisted.smartAccountsFindVendor).not.toHaveBeenCalled();
    expect(adapter.findOrCreateVendor).toHaveBeenCalledOnce();
    expect(result.provider).toBe("smartaccounts");
  });

  it("uses an existing Merit vendor before checking for duplicate invoices", async () => {
    const { importWithAdapter } = await import("./route");

    hoisted.meritFindVendor.mockResolvedValueOnce({
      id: "merit-vendor-existing",
      name: "Vendor OÜ",
    });

    const adapter = buildAdapter<MeritCredentials>();
    const result = await importWithAdapter({
      savedConnection: buildSavedConnection("merit"),
      adapter,
      credentials: {
        apiId: "merit-id",
        apiKey: "merit-key",
      },
      mimeType: "application/pdf",
      filename: "invoice.pdf",
      buffer: Buffer.from("invoice"),
      fingerprint: "abcdef1234567890",
    });

    expect(hoisted.meritFindVendor).toHaveBeenCalledOnce();
    expect(adapter.findOrCreateVendor).not.toHaveBeenCalled();
    expect(result.provider).toBe("merit");
  });

  it("returns null when the invoice number is missing during duplicate lookup", async () => {
    const { findExistingImportedInvoice } = await import("./import-workflow");
    const adapter = buildAdapter<SmartAccountsCredentials>();

    const result = await findExistingImportedInvoice({
      adapter,
      credentials: {
        apiKey: "public",
        secretKey: "secret",
      },
      context: buildContext(),
      extraction: buildExtraction({
        invoice: {
          ...buildExtraction().invoice,
          invoiceNumber: null,
        },
      }),
      savedConnection: buildSavedConnection("smartaccounts"),
      vendor: {
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
        createdVendor: false,
        existingVendor: null,
      },
      rows: [] as never,
    } as Parameters<typeof findExistingImportedInvoice>[0]);

    expect(result).toBeNull();
    expect(adapter.findExistingInvoice).not.toHaveBeenCalled();
  });
});
