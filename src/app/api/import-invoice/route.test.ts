import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  provider: "smartaccounts" | "merit" = "smartaccounts",
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
  hoisted.smartAccountsFindVendor.mockResolvedValue(null);
  hoisted.meritFindVendor.mockResolvedValue(null);

  const { extractInvoiceWithOpenRouter } = await import("@/lib/openrouter");
  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(buildExtraction());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("importWithAdapter payment flows", () => {
  it("returns a completed import with a warning when payment creation fails", async () => {
    const { importWithAdapter } = await import("./route");

    const adapter = buildAdapter();
    vi.mocked(adapter.createPayment).mockRejectedValueOnce(
      new Error("Temporary provider outage"),
    );

    const result = await importWithAdapter({
      savedConnection: buildSavedConnection(),
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

    expect(result.invoiceId).toBe("invoice-1");
    expect(result.createdPayment).toBe(false);
    expect(result.alreadyExisted).toBe(false);
    expect(result.extraction.warnings).toContain(
      "Invoice was created, but recording the payment failed: Temporary provider outage",
    );
  });

  it("uses an existing vendor before checking for duplicate invoices", async () => {
    const { importWithAdapter } = await import("./route");
    hoisted.smartAccountsFindVendor.mockResolvedValueOnce({
      id: "vendor-existing",
      name: "Vendor OÜ",
    });

    const adapter = buildAdapter();
    vi.mocked(adapter.findExistingInvoice).mockResolvedValueOnce({
      invoiceId: "existing-invoice",
    });

    const result = await importWithAdapter({
      savedConnection: buildSavedConnection(),
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

    expect(result.alreadyExisted).toBe(true);
    expect(adapter.findOrCreateVendor).not.toHaveBeenCalled();
    expect(adapter.createPurchaseInvoice).not.toHaveBeenCalled();
  });

  it("generates a fallback invoice number and warning when extraction omits one", async () => {
    const [{ importWithAdapter }, { extractInvoiceWithOpenRouter }] =
      await Promise.all([import("./route"), import("@/lib/openrouter")]);

    vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValueOnce(
      buildExtraction({
        invoice: {
          ...buildExtraction().invoice,
          invoiceNumber: null,
        },
      }),
    );

    const result = await importWithAdapter({
      savedConnection: buildSavedConnection(),
      adapter: buildAdapter(),
      credentials: {
        apiKey: "public",
        secretKey: "secret",
      },
      mimeType: "application/pdf",
      filename: "invoice.pdf",
      buffer: Buffer.from("invoice"),
      fingerprint: "abcdef1234567890",
    });

    expect(result.invoiceNumber).toBe("AUTO-20260414-ABCDEF12");
    expect(result.extraction.warnings[0]).toContain(
      "fallback number was generated",
    );
  });

  it("returns an existing invoice result without creating a duplicate", async () => {
    const { importWithAdapter } = await import("./route");

    const adapter = buildAdapter();
    vi.mocked(adapter.findExistingInvoice).mockResolvedValueOnce({
      invoiceId: "existing-invoice",
    });

    const result = await importWithAdapter({
      savedConnection: buildSavedConnection(),
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

    expect(result.alreadyExisted).toBe(true);
    expect(result.invoiceId).toBe("existing-invoice");
    expect(adapter.createPurchaseInvoice).not.toHaveBeenCalled();
  });
});

describe("importWithAdapter attachment and validation", () => {
  it("falls back to attachDocument when inline attachment is unavailable", async () => {
    const { importWithAdapter } = await import("./route");

    const adapter = buildAdapter();
    vi.mocked(adapter.createPurchaseInvoice).mockResolvedValueOnce({
      invoiceId: "invoice-2",
      attachedFile: false,
    });

    const result = await importWithAdapter({
      savedConnection: buildSavedConnection(),
      adapter,
      credentials: {
        apiKey: "public",
        secretKey: "secret",
      },
      mimeType: "image/png",
      filename: "invoice.png",
      buffer: Buffer.from("invoice"),
      fingerprint: "abcdef1234567890",
    });

    expect(adapter.attachDocument).toHaveBeenCalledOnce();
    expect(result.attachedFile).toBe(true);
  });

  it("returns a warning when attachment upload fails", async () => {
    const { importWithAdapter } = await import("./route");

    const adapter = buildAdapter();
    vi.mocked(adapter.createPurchaseInvoice).mockResolvedValueOnce({
      invoiceId: "invoice-3",
      attachedFile: false,
    });
    vi.mocked(adapter.attachDocument).mockRejectedValueOnce(
      new Error("Attachment rejected"),
    );

    const result = await importWithAdapter({
      savedConnection: buildSavedConnection(),
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

    expect(result.attachedFile).toBe(false);
    expect(result.extraction.warnings).toContain(
      "Invoice was created, but attaching the original file failed: Attachment rejected",
    );
  });

  it("throws when the provider context has no accounts", async () => {
    const { importWithAdapter } = await import("./route");
    const adapter = buildAdapter();
    vi.mocked(adapter.loadContext).mockResolvedValueOnce({
      ...buildContext(),
      referenceData: {
        ...buildContext().referenceData,
        accounts: [],
      },
    });

    await expect(
      importWithAdapter({
        savedConnection: buildSavedConnection(),
        adapter,
        credentials: {
          apiKey: "public",
          secretKey: "secret",
        },
        mimeType: "application/pdf",
        filename: "invoice.pdf",
        buffer: Buffer.from("invoice"),
        fingerprint: "abcdef1234567890",
      }),
    ).rejects.toThrow("returned no chart of accounts");
  });
});

describe("POST auth and validation", () => {
  it("returns 401 when the user is not authenticated", async () => {
    const [{ POST }, { getUser }] = await Promise.all([
      import("./route"),
      import("@/lib/workos"),
    ]);
    vi.mocked(getUser).mockResolvedValue({ user: null });

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
  });

  it("returns 409 when no provider connection is saved", async () => {
    const [{ POST }, { getUser }, { getStoredAccountingConnection }] =
      await Promise.all([
        import("./route"),
        import("@/lib/workos"),
        import("@/lib/user-accounting-connections"),
      ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(null);

    const response = await POST(buildRequest());

    expect(response.status).toBe(409);
  });

  it("returns 400 when the invoice file is missing", async () => {
    const [{ POST }, { getUser }, { getStoredAccountingConnection }] =
      await Promise.all([
        import("./route"),
        import("@/lib/workos"),
        import("@/lib/user-accounting-connections"),
      ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      buildSavedConnection(),
    );

    const response = await POST(buildRequest());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Missing invoice file.");
  });

  it("returns 400 for unsupported file types", async () => {
    const [{ POST }, { getUser }, { getStoredAccountingConnection }] =
      await Promise.all([
        import("./route"),
        import("@/lib/workos"),
        import("@/lib/user-accounting-connections"),
      ]);
    vi.mocked(getUser).mockResolvedValue({ user: { id: "user-1" } as never });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      buildSavedConnection(),
    );

    const response = await POST(
      buildRequest(new File(["hi"], "invoice.txt", { type: "text/plain" })),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      "Only PDF and image invoices are supported right now.",
    );
  });
});
