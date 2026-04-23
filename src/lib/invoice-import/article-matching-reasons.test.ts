import { expect, it } from "vitest";
import { buildArticleSuggestionReason } from "./article-matching-reasons";

it("describes missing article suggestions", () => {
  expect(buildArticleSuggestionReason([])).toContain(
    "No existing article matched the row description",
  );
});

it("describes a single weak candidate as low confidence", () => {
  expect(
    buildArticleSuggestionReason([
      {
        code: "el",
        description: "Elekter",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 18,
        reasons: ["Catalog description is embedded in a compound word."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ]),
  ).toContain("too weak to auto-select automatically");
});

it("returns the top reason for a strong single candidate", () => {
  expect(
    buildArticleSuggestionReason([
      {
        code: "el",
        description: "Elekter",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 48,
        reasons: ["Catalog description matches the invoice row."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ]),
  ).toBe("Catalog description matches the invoice row.");
});

it("describes close competing candidates explicitly", () => {
  expect(
    buildArticleSuggestionReason([
      {
        code: "el",
        description: "Elekter",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 32,
        reasons: ["Catalog description matches the invoice row."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
      {
        code: "uld-el",
        description: "Üldelekter",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 27,
        reasons: ["Catalog description matches the invoice row."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ]),
  ).toContain("were too close to choose automatically");
});

it("returns the top reason when the winner stays clearly ahead of the runner-up", () => {
  expect(
    buildArticleSuggestionReason([
      {
        code: "el",
        description: "Elekter",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 48,
        reasons: ["Catalog description matches the invoice row."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
      {
        code: "water",
        description: "Vesi",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 20,
        reasons: ["Purchase account matches."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ]),
  ).toBe("Catalog description matches the invoice row.");
});

it("falls back to generic reasoning and code-only labels when descriptions are blank", () => {
  expect(
    buildArticleSuggestionReason([
      {
        code: "el",
        description: "",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 25,
        reasons: ["   "],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
      {
        code: "water",
        description: "   ",
        unit: null,
        purchaseAccountCode: null,
        taxCode: null,
        type: null,
        score: 20,
        reasons: ["Purchase account matches."],
        historyMatches: 0,
        recentInvoiceDate: null,
      },
    ]),
  ).toContain(
    "The best candidate only matched on weak supporting signals. el and water were too close to choose automatically.",
  );
});
