import { expect, it } from "vitest";
import { applyAiArticleMatches } from "./article-matching-ai";
import { InvoiceImportDraftRow } from "../invoice-import-types";

function buildRow(
  overrides?: Partial<InvoiceImportDraftRow>,
): InvoiceImportDraftRow {
  return {
    id: "row-1",
    sourceArticleCode: null,
    description: "Elekter oine jaanuar 2025",
    quantity: 1,
    unit: null,
    price: 120,
    sum: 120,
    vatRate: 22,
    taxCode: "VAT22",
    accountCode: "4000",
    accountSelectionReason: "Matched utilities account.",
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [
      {
        code: "el",
        description: "Elekter",
        unit: null,
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
        type: null,
        score: 39,
        reasons: ["Catalog description matches the invoice row."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ],
    suggestionStatus: "ambiguous",
    ...overrides,
  };
}

it("applies a clear AI match as the selected article", () => {
  const rows = applyAiArticleMatches({
    rows: [buildRow()],
    catalog: [
      {
        code: "el",
        description: "Elekter",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
      },
    ],
    matches: [
      {
        rowId: "row-1",
        status: "clear",
        selectedArticleCode: "el",
        alternativeArticleCodes: [],
        reason: "The row clearly describes electricity.",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: "el",
    selectedArticleDescription: "Elekter",
    suggestionStatus: "clear",
  });
  expect(rows[0]?.articleCandidates[0]?.reasons).toContain(
    "AI article matcher: The row clearly describes electricity.",
  );
});

it("keeps heuristic candidates for manual review when AI says missing", () => {
  const rows = applyAiArticleMatches({
    rows: [buildRow()],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [
      {
        rowId: "row-1",
        status: "missing",
        selectedArticleCode: null,
        alternativeArticleCodes: [],
        reason: "No existing article fits closely enough.",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: null,
    suggestionStatus: "ambiguous",
  });
  expect(rows[0]?.articleCandidates).toHaveLength(1);
});

it("keeps an empty candidate list when AI says a row is missing", () => {
  const rows = applyAiArticleMatches({
    rows: [buildRow({ articleCandidates: [], suggestionStatus: "missing" })],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [
      {
        rowId: "row-1",
        status: "missing",
        selectedArticleCode: null,
        alternativeArticleCodes: [],
        reason: "No existing article fits closely enough.",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: null,
    suggestionStatus: "missing",
    articleCandidates: [],
  });
});

it("uses a default missing reason when the AI leaves it blank", () => {
  const rows = applyAiArticleMatches({
    rows: [buildRow()],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [
      {
        rowId: "row-1",
        status: "missing",
        selectedArticleCode: null,
        alternativeArticleCodes: [],
        reason: "   ",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: null,
    suggestionStatus: "ambiguous",
  });
});

it("keeps the row unselected for ambiguous AI matches", () => {
  const rows = applyAiArticleMatches({
    rows: [buildRow()],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [
      {
        rowId: "row-1",
        status: "ambiguous",
        selectedArticleCode: "el",
        alternativeArticleCodes: [],
        reason: "",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: null,
    suggestionStatus: "ambiguous",
  });
  expect(rows[0]?.articleCandidates[0]?.reasons).toContain(
    "AI article matcher: Matched the invoice row to this article.",
  );
});

it("keeps a clear heuristic match when the AI returns the same single article as ambiguous", () => {
  const rows = applyAiArticleMatches({
    rows: [
      buildRow({
        selectedArticleCode: "el",
        selectedArticleDescription: "Elekter",
        suggestionStatus: "clear",
      }),
    ],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [
      {
        rowId: "row-1",
        status: "ambiguous",
        selectedArticleCode: "el",
        alternativeArticleCodes: [],
        reason:
          "The row still points to electricity, but the model did not name a competing article.",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: "el",
    selectedArticleDescription: "Elekter",
    suggestionStatus: "clear",
    articleSuggestionReason:
      "The row still points to electricity, but the model did not name a competing article.",
  });
});

it("builds AI candidates from catalog metadata when no heuristic candidate exists", () => {
  const rows = applyAiArticleMatches({
    rows: [buildRow({ articleCandidates: [] })],
    catalog: [
      {
        code: "el",
        description: "Elekter",
        unit: "kWh",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
        type: "SERVICE",
      },
    ],
    matches: [
      {
        rowId: "row-1",
        status: "clear",
        selectedArticleCode: "el",
        alternativeArticleCodes: [],
        reason: "AI matched the row to electricity.",
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    selectedArticleCode: "el",
    selectedArticleDescription: "Elekter",
    unit: "kWh",
    accountCode: "4000",
    taxCode: "VAT22",
    suggestionStatus: "clear",
  });
  expect(rows[0]?.articleCandidates[0]).toMatchObject({
    type: "SERVICE",
    score: 120,
    historyMatches: 0,
    recentInvoiceDate: null,
  });
});

it("ignores invalid AI article codes and leaves the heuristic row unchanged", () => {
  const row = buildRow();
  const rows = applyAiArticleMatches({
    rows: [row],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [
      {
        rowId: "row-1",
        status: "clear",
        selectedArticleCode: "missing-code",
        alternativeArticleCodes: [],
        reason: "Wrong code from the model.",
      },
    ],
  });

  expect(rows[0]).toEqual(row);
});

it("leaves rows without an AI result untouched", () => {
  const row = buildRow();
  const rows = applyAiArticleMatches({
    rows: [row],
    catalog: [{ code: "el", description: "Elekter" }],
    matches: [],
  });

  expect(rows[0]).toEqual(row);
});
