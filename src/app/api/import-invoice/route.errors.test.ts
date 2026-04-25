import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  getStoredAccountingConnection: vi.fn(),
  getUser: vi.fn(),
  meritProviderAdapter: {
    loadContext: vi.fn(),
    findExistingInvoice: vi.fn(),
    createPurchaseInvoice: vi.fn(),
    createPayment: vi.fn(),
    attachDocument: vi.fn(),
  },
  smartAccountsProviderAdapter: {
    loadContext: vi.fn(),
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
  getUser: hoisted.getUser,
}));
vi.mock("@/lib/user-accounting-connections", () => ({
  getStoredAccountingConnection: hoisted.getStoredAccountingConnection,
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
vi.mock("@/lib/smartaccounts", () => ({
  smartAccountsProviderAdapter: hoisted.smartAccountsProviderAdapter,
}));

function buildSavedConnection() {
  return {
    companyId: "company-1",
    provider: "smartaccounts" as const,
    credentials: {
      provider: "smartaccounts" as const,
      credentials: {
        apiKey: "public",
        secretKey: "secret",
      },
    },
    summary: {
      provider: "smartaccounts" as const,
      label: "SmartAccounts",
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

describe("POST import errors", () => {
  it("returns 500 for unexpected import errors", async () => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.getUser.mockResolvedValue({ user: { id: "user-1" } as never });
    hoisted.getStoredAccountingConnection.mockResolvedValue(
      buildSavedConnection(),
    );
    hoisted.smartAccountsProviderAdapter.loadContext.mockRejectedValueOnce(
      new Error("Provider offline"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      buildRequest(
        new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("Provider offline");
  });

  it("returns a generic 500 error for non-Error failures", async () => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.getUser.mockResolvedValue({ user: { id: "user-1" } as never });
    hoisted.getStoredAccountingConnection.mockResolvedValue(
      buildSavedConnection(),
    );
    hoisted.smartAccountsProviderAdapter.loadContext.mockRejectedValueOnce(
      "boom",
    );
    const { POST } = await import("./route");

    const response = await POST(
      buildRequest(
        new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("Unknown error");
  });
});
