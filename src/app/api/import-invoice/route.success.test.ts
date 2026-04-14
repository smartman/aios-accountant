import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AccountingProviderAdapter,
  ProviderRuntimeContext,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import type { InvoiceExtraction } from "@/lib/invoice-import-types";
import type { StoredAccountingConnection } from "@/lib/user-accounting-connections";

const hoisted = vi.hoisted(() => ({
  meritProviderAdapter: {
    loadContext: vi.fn(),
    findOrCreateVendor: vi.fn(),
    findExistingInvoice: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
  smartAccountsProviderAdapter: {
    loadContext: vi.fn(),
    findOrCreateVendor: vi.fn(),
    findExistingInvoice: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
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
  meritProviderAdapter: hoisted.meritProviderAdapter,
}));
vi.mock("@/lib/smartaccounts-adapter", () => ({
  smartAccountsProviderAdapter: hoisted.smartAccountsProviderAdapter,
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

function buildAdapter(): AccountingProviderAdapter<SmartAccountsCredentials> {
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

function buildRequest(file?: File): Request {
  const formData = new FormData();
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
    expect(
      hoisted.smartAccountsProviderAdapter.loadContext,
    ).toHaveBeenCalledOnce();
  });

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
    expect(
      hoisted.meritProviderAdapter.createPurchaseInvoice,
    ).toHaveBeenCalledOnce();
  });
});
