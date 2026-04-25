import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceExtraction } from "../invoice-import-types";

const { mockApplyAiArticleMatches, mockMatchArticlesWithOpenRouter } =
  vi.hoisted(() => ({
    mockApplyAiArticleMatches: vi.fn(),
    mockMatchArticlesWithOpenRouter: vi.fn(),
  }));

vi.mock("./article-matching-ai", () => ({
  applyAiArticleMatches: mockApplyAiArticleMatches,
  matchArticlesWithOpenRouter: mockMatchArticlesWithOpenRouter,
}));

import { resolvePreviewRows } from "./preview-row-resolution";

function buildExtraction(
  overrides?: Partial<InvoiceExtraction>,
): InvoiceExtraction {
  return {
    vendor: {
      name: "Utility OU",
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
      notes: "Fallback electricity note",
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [
      {
        sourceArticleCode: null,
        description: "Elekter oine jaanuar 2025",
        quantity: 1,
        unit: null,
        price: 100,
        sum: 122,
        vatRate: 22,
        vatPc: "VAT22",
        accountPurchase: "4000",
        accountSelectionReason: "Matched utilities account.",
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function buildParams(overrides?: {
  extraction?: InvoiceExtraction;
  vendorMatch?: { vendorId: string; vendorName: string } | null;
}): Parameters<typeof resolvePreviewRows>[0] {
  const extraction = overrides?.extraction ?? buildExtraction();

  return {
    savedConnection: {
      workosUserId: "user-1",
      provider: "smartaccounts" as const,
      credentials: {
        provider: "smartaccounts" as const,
        credentials: { apiKey: "public", secretKey: "secret" },
      },
      summary: {
        provider: "smartaccounts" as const,
        label: "SmartAccounts",
        detail: "Verified",
        verifiedAt: new Date().toISOString(),
      },
      verifiedAt: new Date(),
    },
    activities: {
      listArticles: vi.fn().mockResolvedValue([
        {
          code: "el",
          description: "Elekter",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
        },
      ]),
      getVendorArticleHistory: vi.fn().mockResolvedValue([
        {
          invoiceId: "hist-1",
          vendorId: "vendor-1",
          vendorName: "Utility OU",
          issueDate: "2026-04-01",
          description: "Elekter paev jaanuar 2025",
          articleCode: "el",
          articleDescription: "Elekter",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
        },
      ]),
    },
    credentials: {} as never,
    extraction,
    context: {
      provider: "smartaccounts" as const,
      referenceData: {
        accounts: [
          { code: "4000", type: "EXPENSE", label: "4000 - Utilities" },
        ],
        taxCodes: [{ code: "VAT22", rate: 22, description: "22% VAT" }],
        paymentAccounts: [],
      },
    },
    vendorMatch:
      overrides && "vendorMatch" in overrides
        ? overrides.vendorMatch
        : {
            vendorId: "vendor-1",
            vendorName: "Utility OU",
          },
  } as unknown as Parameters<typeof resolvePreviewRows>[0];
}

describe("resolvePreviewRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyAiArticleMatches.mockImplementation(
      ({ rows }: { rows: unknown[] }) => rows,
    );
    mockMatchArticlesWithOpenRouter.mockResolvedValue(null);
  });

  it("creates a fallback row when the extraction has no rows and keeps history unloaded without a vendor match", async () => {
    const params = buildParams({
      extraction: buildExtraction({ rows: [] }),
      vendorMatch: null,
    });

    const result = await resolvePreviewRows(params);

    expect(result.historyLoaded).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.description).toBe("Fallback electricity note");
    expect(params.activities.getVendorArticleHistory).not.toHaveBeenCalled();
    expect(mockMatchArticlesWithOpenRouter).toHaveBeenCalledTimes(1);
  });

  it("applies AI article matches after vendor history is loaded", async () => {
    mockMatchArticlesWithOpenRouter.mockResolvedValueOnce([
      {
        rowId: "row-1",
        status: "clear",
        selectedArticleCode: "el",
        alternativeArticleCodes: [],
        reason: "AI matched the electricity row.",
      },
    ]);
    mockApplyAiArticleMatches.mockImplementationOnce(({ rows }) =>
      rows.map((row: { id: string }) => ({
        ...row,
        selectedArticleCode: "el",
        selectedArticleDescription: "Elekter",
        suggestionStatus: "clear" as const,
      })),
    );
    const params = buildParams({
      extraction: buildExtraction({
        rows: [
          {
            sourceArticleCode: null,
            description: "Utility network service",
            quantity: 1,
            unit: null,
            price: 100,
            sum: 122,
            vatRate: 22,
            vatPc: "VAT22",
            accountPurchase: "4000",
            accountSelectionReason: "Matched utilities account.",
          },
        ],
      }),
    });

    const result = await resolvePreviewRows(params);

    expect(result.historyLoaded).toBe(true);
    expect(params.activities.getVendorArticleHistory).toHaveBeenCalledTimes(1);
    expect(mockMatchArticlesWithOpenRouter).toHaveBeenCalledTimes(1);
    expect(mockApplyAiArticleMatches).toHaveBeenCalledTimes(1);
    expect(result.rows[0]).toMatchObject({
      selectedArticleCode: "el",
      selectedArticleDescription: "Elekter",
      suggestionStatus: "clear",
    });
  });

  it("falls back to heuristic rows when the AI matcher throws", async () => {
    mockMatchArticlesWithOpenRouter.mockRejectedValueOnce(new Error("boom"));
    const params = buildParams();

    const result = await resolvePreviewRows(params);

    expect(mockApplyAiArticleMatches).not.toHaveBeenCalled();
    expect(result.rows[0]).toMatchObject({
      selectedArticleCode: "el",
      suggestionStatus: "clear",
    });
  });

  it("carries manual review flags from extracted rows into the draft", async () => {
    const params = buildParams({
      extraction: buildExtraction({
        rows: [
          {
            sourceArticleCode: null,
            description: "Unreadable cafe receipt row",
            quantity: 1,
            unit: null,
            price: 10,
            sum: 10,
            vatRate: 22,
            vatPc: "VAT22",
            accountPurchase: "4000",
            accountSelectionReason: "Matched utilities account.",
            needsManualReview: true,
            manualReviewReason: "Description is partly hidden by glare.",
          },
        ],
      }),
    });

    const result = await resolvePreviewRows(params);

    expect(result.rows[0]).toMatchObject({
      needsManualReview: true,
      manualReviewReason: "Description is partly hidden by glare.",
    });
  });
});
