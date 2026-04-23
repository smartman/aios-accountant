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

describe("article matching description-first ranking", () => {
  it("prioritizes row description over source article code", () => {
    const candidates = buildArticleCandidates({
      row: buildRow(),
      catalog: [
        {
          code: "IT",
          description: "Office chair with wheels",
          unit: "pcs",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
        },
        {
          code: "SUPPLIER_SKU",
          description: "SKU-CHAIR-01 supplier code",
          unit: "pcs",
          purchaseAccountCode: "4010",
        },
      ],
      history: [],
    });

    expect(candidates[0]).toMatchObject({
      code: "IT",
      historyMatches: 0,
    });
    expect(candidates[0]?.reasons).toContain(
      "Catalog description matches the invoice row.",
    );
  });

  it("ignores blank code and description needles while scoring", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: "   ",
        description: "   ",
        accountCode: "9999",
        taxCode: null,
        unit: null,
      }),
      catalog: [{ code: "FUEL", description: "Fuel" }],
      history: [],
    });

    expect(candidates).toEqual([]);
  });

  it("uses vendor history as the next tiebreaker after code and description", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: null,
        description: "Consulting services",
        accountCode: "4000",
        taxCode: null,
        unit: null,
      }),
      catalog: [
        { code: "SERV01", description: "Consulting services" },
        { code: "SERV02", description: "Consulting services" },
      ],
      history: [
        {
          invoiceId: "hist-3",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          description: "Consulting services",
          articleCode: "SERV02",
          articleDescription: "Consulting services",
        },
      ],
    });

    expect(candidates[0]?.code).toBe("SERV02");
  });
});

describe("article matching vendor-history boosts", () => {
  it("uses previous vendor invoice row descriptions to lift a generic article", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: "MAG 275QF E20",
        description: 'MSI MAG 275QF E20 27" LED WQHD monitor',
        accountCode: "it",
        taxCode: null,
        unit: null,
      }),
      catalog: [
        {
          code: "it",
          description: "IT teenused, arvutitarvikud",
          purchaseAccountCode: "it",
        },
        {
          code: "kaup",
          description: "Ostetud kaubad müügiks - kuluks",
          purchaseAccountCode: "kaup",
        },
      ],
      history: [
        {
          invoiceId: "hist-4",
          vendorId: "vendor-1",
          vendorName: "ARVUTITARK OÜ",
          invoiceNumber: "104026820",
          issueDate: "2026-04-07",
          description: 'MSI MAG 275QF E20 27" LED WQHD monitor',
          articleCode: "it",
          articleDescription: "IT teenused, arvutitarvikud",
          purchaseAccountCode: "it",
        },
      ],
    });

    expect(candidates[0]).toMatchObject({
      code: "it",
      historyMatches: 1,
    });
    expect(candidates[0]?.reasons).toContain(
      "Previous invoices from the same vendor used this article.",
    );
  });

  it("boosts vendor history further when tax code and unit also match", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: null,
        description: "Laptop dock",
        accountCode: "it",
        taxCode: "VAT22",
        unit: "pcs",
      }),
      catalog: [
        {
          code: "it",
          description: "IT teenused, arvutitarvikud",
          purchaseAccountCode: "it",
          taxCode: "VAT22",
          unit: "pcs",
        },
      ],
      history: [
        {
          invoiceId: "hist-5",
          vendorId: "vendor-1",
          vendorName: "ARVUTITARK OÜ",
          description: "Laptop dock",
          articleCode: "it",
          articleDescription: "IT teenused, arvutitarvikud",
          purchaseAccountCode: "it",
          taxCode: "VAT22",
          unit: "pcs",
        },
      ],
    });

    expect(candidates[0]).toMatchObject({
      code: "it",
      historyMatches: 1,
    });
    expect(candidates[0]?.score).toBeGreaterThan(100);
  });
});

describe("article matching history and metadata ranking", () => {
  it("uses accounting metadata only after code, description, and vendor history", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: null,
        description: "Consulting services",
        accountCode: "4000",
        taxCode: "VAT22",
        unit: "pcs",
      }),
      catalog: [
        { code: "SERV01", description: "Consulting services" },
        {
          code: "SERV02",
          description: "Consulting services",
          purchaseAccountCode: "4000",
          taxCode: "VAT22",
          unit: "pcs",
        },
      ],
      history: [],
    });

    expect(candidates[0]?.code).toBe("SERV02");
  });

  it("uses exact source code as the tiebreaker after description and history", () => {
    const candidates = buildArticleCandidates({
      row: buildRow({
        sourceArticleCode: "SERV02",
        description: "Consulting services",
        accountCode: "4000",
        taxCode: null,
        unit: null,
      }),
      catalog: [
        { code: "SERV01", description: "Consulting services" },
        { code: "SERV02", description: "Consulting services" },
      ],
      history: [],
    });

    expect(candidates[0]?.code).toBe("SERV02");
    expect(candidates[0]?.reasons).toContain(
      "Exact source article code match.",
    );
  });
});

describe("article matching suggestion status", () => {
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
