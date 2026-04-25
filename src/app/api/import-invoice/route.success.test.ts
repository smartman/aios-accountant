import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ProviderRuntimeContext,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import type { AccountingProviderActivities } from "@/lib/accounting-provider-activities";
import type { InvoiceExtraction } from "@/lib/invoice-import-types";
import type { StoredAccountingConnection } from "@/lib/user-accounting-connections";

const hoisted = vi.hoisted(() => ({
  meritProviderAdapter: {
    loadContext: vi.fn(),
    findVendor: vi.fn(),
    findExistingInvoice: vi.fn(),
    listArticles: vi.fn(),
    getVendorArticleHistory: vi.fn(),
    createVendor: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
  smartAccountsProviderAdapter: {
    loadContext: vi.fn(),
    findVendor: vi.fn(),
    findExistingInvoice: vi.fn(),
    listArticles: vi.fn(),
    getVendorArticleHistory: vi.fn(),
    createVendor: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
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
vi.mock("@/lib/companies/repository", () => ({
  requireCompanyForUser: vi.fn(async ({ companyId }) => ({
    id: companyId,
    name: "Test company",
    countryCode: "EE",
    emtakCode: "69202",
    emtakLabel: "Bookkeeping",
    accountingProvider: "smartaccounts",
    configuration: {
      fixedAssetThreshold: 2000,
      inventory: { defaultUnit: "tk", newArticlePolicy: "confirm" },
      vendorExceptions: {},
      projects: [],
    },
    connectionSummary: null,
    members: [],
    invitations: [],
  })),
}));
vi.mock("@/lib/companies/ai-context", () => ({
  buildCompanyAiContext: vi.fn(() => "Company context"),
}));
vi.mock("@/lib/merit", () => ({
  meritProviderAdapter: hoisted.meritProviderAdapter,
}));
vi.mock("@/lib/providers/merit/data", () => ({
  findVendor: hoisted.meritFindVendor,
}));
vi.mock("@/lib/smartaccounts", () => ({
  smartAccountsProviderAdapter: hoisted.smartAccountsProviderAdapter,
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

function buildContext(): ProviderRuntimeContext {
  return {
    provider: "smartaccounts",
    referenceData: {
      accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - Services" }],
      taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
      paymentAccounts: [{ type: "BANK", name: "Main bank", currency: "EUR" }],
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

function buildAdapter(): AccountingProviderActivities<SmartAccountsCredentials> {
  return {
    provider: "smartaccounts",
    validateCredentials: vi.fn(),
    loadContext: vi.fn(async () => buildContext()),
    findVendor: vi.fn(async () => ({
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
    })),
    createVendor: vi.fn(async () => ({
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
    })),
    listArticles: vi.fn(async () => [
      {
        code: "FURNITURE",
        description: "Furniture",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
      },
    ]),
    getVendorArticleHistory: vi.fn(async () => []),
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

function buildSavedConnection(
  provider: "smartaccounts" | "merit",
  companyId: string | undefined = "company-1",
): StoredAccountingConnection {
  return {
    companyId,
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

function buildRequest(file?: File): Request {
  const formData = new FormData();
  formData.set("companyId", "company-1");
  if (file) {
    formData.set("invoice", file);
  }

  return new Request("http://localhost/api/import-invoice", {
    method: "POST",
    body: formData,
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  Object.assign(hoisted.smartAccountsProviderAdapter, buildAdapter());
  Object.assign(hoisted.meritProviderAdapter, buildAdapter());
  hoisted.smartAccountsFindVendor.mockResolvedValue(null);
  hoisted.meritFindVendor.mockResolvedValue(null);

  const { extractInvoiceWithOpenRouter } = await import("@/lib/openrouter");
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(buildExtraction());
});

describe("POST imports", () => {
  it("imports with the SmartAccounts adapter when a connection is present", async () => {
    const [
      { POST },
      { getUser },
      { getStoredAccountingConnection },
      { extractInvoiceWithOpenRouter },
    ] = await Promise.all([
      import("./route"),
      import("@/lib/workos"),
      import("@/lib/user-accounting-connections"),
      import("@/lib/openrouter"),
    ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      buildSavedConnection("smartaccounts"),
    );
    vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(
      buildExtraction({
        payment: {
          isPaid: false,
          paymentDate: null,
          paymentAmount: null,
          paymentChannelHint: null,
          reason: null,
        },
      }),
    );

    const response = await POST(
      buildRequest(
        new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.provider).toBe("smartaccounts");
    expect(payload.draft.rows).toHaveLength(1);
    expect(
      hoisted.smartAccountsProviderAdapter.loadContext,
    ).toHaveBeenCalledOnce();
    expect(
      hoisted.smartAccountsProviderAdapter.loadContext,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheScope: "company-1",
      }),
    );
  });
});

describe("POST photographed invoice imports", () => {
  it("imports photographed invoice images even when the browser sends a generic MIME type", async () => {
    const [
      { POST },
      { getUser },
      { getStoredAccountingConnection },
      { extractInvoiceWithOpenRouter },
    ] = await Promise.all([
      import("./route"),
      import("@/lib/workos"),
      import("@/lib/user-accounting-connections"),
      import("@/lib/openrouter"),
    ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      buildSavedConnection("smartaccounts"),
    );

    const response = await POST(
      buildRequest(
        new File(["photo-bytes"], "restaurant receipt.JPG", {
          type: "application/octet-stream",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(extractInvoiceWithOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "restaurant_receipt.JPG",
        mimeType: "image/jpeg",
        fileDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      }),
    );
  });
});

describe("POST Merit imports", () => {
  it("imports with the Merit adapter when a Merit connection is present", async () => {
    const [{ POST }, { getUser }, { getStoredAccountingConnection }] =
      await Promise.all([
        import("./route"),
        import("@/lib/workos"),
        import("@/lib/user-accounting-connections"),
      ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      buildSavedConnection("merit"),
    );

    const response = await POST(
      buildRequest(
        new File(["invoice"], "../invoice.pdf", { type: "application/pdf" }),
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.provider).toBe("merit");
    expect(hoisted.meritProviderAdapter.loadContext).toHaveBeenCalledOnce();
    expect(hoisted.meritProviderAdapter.loadContext).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheScope: "company-1",
      }),
    );
  });

  it("falls back to a global cache scope for old provider records", async () => {
    const [{ POST }, { getUser }, { getStoredAccountingConnection }] =
      await Promise.all([
        import("./route"),
        import("@/lib/workos"),
        import("@/lib/user-accounting-connections"),
      ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    const oldConnection = buildSavedConnection("merit");
    delete oldConnection.companyId;
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(oldConnection);

    const response = await POST(
      buildRequest(
        new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
      ),
    );

    expect(response.status).toBe(200);
    expect(hoisted.meritProviderAdapter.loadContext).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheScope: "global",
      }),
    );
  });
});
