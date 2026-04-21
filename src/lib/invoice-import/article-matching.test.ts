import { describe, expect, it } from "vitest";
import {
  buildArticleCandidates,
  getArticleSuggestionStatus,
} from "./article-matching";
import { InvoiceImportDraftRow } from "../invoice-import-types";

function buildRow(
  overrides?: Partial<InvoiceImportDraftRow>,
): InvoiceImportDraftRow {
  return {
    id: "row-1",
    sourceArticleCode: "SKU-CHAIR-01",
    description: "Office chair with wheels",
    quantity: 1,
    unit: "pcs",
    price: 120,
    sum: 120,
    vatRate: 22,
    taxCode: "VAT22",
    accountCode: "4000",
    accountSelectionReason: "Matched furniture account.",
    articleDecision: "existing",
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
    newArticle: {
      code: "FURNITURE",
      description: "Furniture",
      unit: "pcs",
      type: "SERVICE",
      purchaseAccountCode: "4000",
      taxCode: "VAT22",
    },
    ...overrides,
  };
}

describe("article matching", () => {
  it("ranks vendor-history-backed generic accounting items first", () => {
    const candidates = buildArticleCandidates({
      row: buildRow(),
      catalog: [
        {
          code: "FURNITURE",
          description: "Furniture",
          unit: "pcs",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
        },
        {
          code: "SUPPLIER_SKU",
          description: "SKU-CHAIR-01 from supplier catalog",
          unit: "pcs",
          purchaseAccountCode: "4010",
        },
      ],
      history: [
        {
          invoiceId: "hist-1",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          invoiceNumber: "INV-OLD-1",
          issueDate: "2026-04-01",
          sourceArticleCode: "SKU-CHAIR-01",
          description: "Office chair ergonomic",
          articleCode: "FURNITURE",
          articleDescription: "Furniture",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
          unit: "pcs",
        },
      ],
    });

    expect(candidates[0]).toMatchObject({
      code: "FURNITURE",
      historyMatches: 1,
    });
    expect(candidates[0]?.reasons.join(" ")).toContain("Previous invoices");
    expect(getArticleSuggestionStatus(candidates)).toBe("clear");
  });

  it("returns ambiguous when top candidates are too close", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: null,
        description: "Consulting services",
      }),
      catalog: [
        { code: "SERV01", description: "Consulting services" },
        { code: "SERV02", description: "Consulting services" },
      ],
      history: [],
    });

    expect(candidates).toHaveLength(2);
    expect(getArticleSuggestionStatus(candidates)).toBe("ambiguous");
  });

  it("returns missing when nothing matches", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({ sourceArticleCode: null, description: "Mystery line" }),
      catalog: [{ code: "FUEL", description: "Fuel" }],
      history: [],
    });

    expect(candidates).toEqual([]);
    expect(getArticleSuggestionStatus(candidates)).toBe("missing");
  });

  it("boosts exact source-code matches and ignores inactive catalog rows", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({ sourceArticleCode: "FURNITURE" }),
      catalog: [
        {
          code: "FURNITURE",
          description: "Furniture",
          activePurchase: true,
        },
        {
          code: "FURNITURE_OLD",
          description: "Legacy furniture",
          activePurchase: false,
        },
      ],
      history: [
        {
          invoiceId: "hist-2",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          invoiceNumber: "INV-OLD-2",
          issueDate: "2026-04-02",
          sourceArticleCode: "",
          description: "",
          articleCode: "UNRELATED",
          articleDescription: "Unrelated",
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      code: "FURNITURE",
      historyMatches: 0,
    });
    expect(candidates[0]?.reasons).toContain(
      "Exact source article code match.",
    );
    expect(getArticleSuggestionStatus(candidates)).toBe("clear");
  });
});
