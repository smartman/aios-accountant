import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "@/lib/invoice-import-types";
import {
  buildPreview,
  findControlByLabel,
  hostProps,
  renderTree,
} from "./InvoiceImportRowEditorTestUtils";

it("renders the minimal existing-article flow and allows article override", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain("Article");
  expect(markup).not.toContain("Article match");
  expect(markup).not.toContain(">clear<");
  expect(markup).not.toContain("Source article code");
  expect(markup).not.toContain("Row details");
  expect(markup).not.toContain("Accounting</p>");
  expect(markup).not.toContain("Create new");
  expect(markup).not.toContain(
    "Auto-selected the closest existing article. You can change it.",
  );
  expect(markup).not.toContain(
    "Article not detected, choose manually or create new article and refresh the article cache.",
  );
  expect(markup).toContain("Search accounting articles");

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "MONITOR-ALT" },
  });

  expect(updates.at(-1)?.rows[0]).toMatchObject({
    selectedArticleCode: "MONITOR-ALT",
    selectedArticleDescription: "Monitor alt",
    unit: "pcs",
    accountCode: "10921",
  });
});

it("handles ambiguous and missing article states cleanly", () => {
  const ambiguousPreview = buildPreview({
    suggestionStatus: "ambiguous",
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  expect(renderToStaticMarkup(renderTree(ambiguousPreview))).toContain(
    "Several similar articles were found. Choose the correct article manually.",
  );

  const lowConfidencePreview = buildPreview({
    suggestionStatus: "ambiguous",
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [buildPreview().draft.rows[0].articleCandidates[0]],
    articleSuggestionReason:
      "Catalog description is embedded in a compound word in the invoice row.",
  });
  const lowConfidenceMarkup = renderToStaticMarkup(
    renderTree(lowConfidencePreview),
  );
  expect(lowConfidenceMarkup).toContain(
    "A possible article match was found, but the confidence was too low to auto-select it. Choose the correct article manually.",
  );
  expect(lowConfidenceMarkup).toContain(
    "Catalog description is embedded in a compound word in the invoice row.",
  );
  expect(lowConfidenceMarkup).toContain("Why is the article match ambiguous?");

  const missingPreview = buildPreview({
    sourceArticleCode: null,
    unit: null,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
  });
  missingPreview.articleOptions = [
    {
      code: "BLANK-DESC",
      description: null,
      unit: null,
      purchaseAccountCode: null,
      taxCode: null,
      type: null,
    },
  ];
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(missingPreview, (draft) => updates.push(draft));
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain(
    "Article not detected, choose manually or create new article and refresh the article cache.",
  );
  expect(markup).toContain("No description");
  expect(markup).toContain("Search accounting articles");
  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "BLANK-DESC" },
  });
  expect(updates.at(-1)?.rows[0]).toMatchObject({
    selectedArticleCode: "BLANK-DESC",
    selectedArticleDescription: null,
  });
});

it("falls back to normalized candidate metadata when preview articles omit fields", () => {
  const preview = buildPreview({
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
  });
  preview.articleOptions = [
    {
      code: "NO-META",
      description: null,
      unit: undefined,
      purchaseAccountCode: undefined,
      taxCode: undefined,
      type: undefined,
    },
  ];
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "NO-META" },
  });

  expect(updates.at(-1)?.rows[0].articleCandidates).toContainEqual(
    expect.objectContaining({
      code: "NO-META",
      description: "NO-META",
      unit: null,
      purchaseAccountCode: null,
      taxCode: null,
      type: null,
    }),
  );
});

it("uses preview article metadata when the manual selection is outside suggestions", () => {
  const preview = buildPreview({
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
  });
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "MONITOR-ALT" },
  });

  expect(updates.at(-1)?.rows[0]).toMatchObject({
    selectedArticleCode: "MONITOR-ALT",
    selectedArticleDescription: "Monitor alt",
  });
});

it("does not overwrite an existing custom unit when selecting an article", () => {
  const preview = buildPreview({
    unit: "tk",
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "MONITOR-ALT" },
  });

  expect(updates.at(-1)?.rows[0]).toMatchObject({
    selectedArticleCode: "MONITOR-ALT",
    unit: "tk",
  });
});

it("uses candidate metadata when preview article metadata is unavailable", () => {
  const preview = buildPreview({
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  preview.articleOptions = undefined;
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "MSIMAG2701" },
  });

  expect(updates.at(-1)?.rows[0]).toMatchObject({
    selectedArticleCode: "MSIMAG2701",
    selectedArticleDescription: "MSI MAG 275QF E20",
    unit: "pcs",
    accountCode: "10921",
  });
});

it("keeps existing candidates when the selected article is absent from preview metadata", () => {
  const preview = buildPreview({
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  preview.articleOptions = [];
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "MSIMAG2701" },
  });

  expect(updates.at(-1)?.rows[0].articleCandidates).toEqual(
    preview.draft.rows[0].articleCandidates,
  );
});
