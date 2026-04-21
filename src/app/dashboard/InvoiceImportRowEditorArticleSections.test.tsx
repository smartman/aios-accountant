import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "@/lib/invoice-import-types";
import {
  buildPreview,
  findButton,
  findControlByLabel,
  hostProps,
  renderTree,
} from "./InvoiceImportRowEditorTestUtils";

it("renders the minimal existing-article flow and allows article override", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain("Article match");
  expect(markup).not.toContain("Source article code");
  expect(markup).not.toContain("Row details");
  expect(markup).not.toContain("Accounting</p>");

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "MONITOR-ALT" },
  });

  expect(updates.at(-1)?.rows[0]).toMatchObject({
    articleDecision: "existing",
    selectedArticleCode: "MONITOR-ALT",
    selectedArticleDescription: "Monitor alt",
    unit: "pcs",
    accountCode: "10921",
  });
});

it("switches between existing and create modes", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];

  const existingTree = renderTree(preview, (draft) => updates.push(draft));
  const createButton = findButton(existingTree, "Create new");
  if (!createButton) {
    throw new Error("Expected create button.");
  }

  hostProps(createButton).onClick?.();
  expect(updates.at(-1)?.rows[0].articleDecision).toBe("create");

  const createPreview = {
    ...preview,
    draft: updates.at(-1) ?? preview.draft,
  };
  const createTree = renderTree(createPreview, (draft) => updates.push(draft));
  const existingButton = findButton(createTree, "Use existing");
  if (!existingButton) {
    throw new Error("Expected existing button.");
  }

  hostProps(existingButton).onClick?.();
  expect(updates.at(-1)?.rows[0].articleDecision).toBe("existing");
});

it("updates create-mode fields and default option fallbacks", () => {
  const preview = buildPreview({
    articleDecision: "create",
    unit: null,
    newArticle: {
      code: "NEW-MONITOR",
      description: "Monitor",
      unit: "",
      type: "SERVICE",
      purchaseAccountCode: "10921",
      taxCode: "VAT24",
    },
  });
  preview.articleTypeOptions = undefined;
  preview.articleOptions = undefined;
  preview.unitOptions = undefined;

  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain("New article unit");
  expect(markup).toContain(">SERVICE<");

  const newCodeInput = findControlByLabel(tree, "New article code", "input");
  hostProps(newCodeInput).onChange?.({
    target: { value: "MONITOR_NEW" },
  });
  expect(updates.at(-1)?.rows[0].newArticle.code).toBe("MONITOR_NEW");

  const newDescriptionInput = findControlByLabel(
    tree,
    "New article description",
    "input",
  );
  hostProps(newDescriptionInput).onChange?.({
    target: { value: "Monitor created from review" },
  });
  expect(updates.at(-1)?.rows[0].newArticle.description).toBe(
    "Monitor created from review",
  );

  const newUnitSelect = findControlByLabel(tree, "New article unit", "select");
  hostProps(newUnitSelect).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].newArticle.unit).toBe("");

  const newTypeSelect = findControlByLabel(tree, "New article type", "select");
  hostProps(newTypeSelect).onChange?.({
    target: { value: "SERVICE" },
  });
  expect(updates.at(-1)?.rows[0].newArticle.type).toBe("SERVICE");
});

it("uses available unit options when creating a new article", () => {
  const preview = buildPreview({
    articleDecision: "create",
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  preview.unitOptions = ["", "tk"];
  preview.articleOptions = [
    {
      code: "MONITOR-ALT",
      description: "Monitor alt",
      unit: null,
      purchaseAccountCode: "10921",
      taxCode: "VAT24",
      type: "PRODUCT",
    },
  ];
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const newUnitSelect = findControlByLabel(tree, "New article unit", "select");
  hostProps(newUnitSelect).onChange?.({
    target: { value: "tk" },
  });
  expect(updates.at(-1)?.rows[0].newArticle.unit).toBe("tk");
});

it("includes units discovered from preview article metadata", () => {
  const preview = buildPreview({
    articleDecision: "create",
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  preview.unitOptions = undefined;
  preview.articleOptions = [
    {
      code: "BOXED-ITEM",
      description: "Boxed item",
      unit: "box",
      purchaseAccountCode: "4000",
      taxCode: "VAT24",
      type: "PRODUCT",
    },
  ];

  const markup = renderToStaticMarkup(renderTree(preview));

  expect(markup).toContain(">box<");
});

it("handles ambiguous and missing article states cleanly", () => {
  const ambiguousPreview = buildPreview({
    suggestionStatus: "ambiguous",
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  expect(renderToStaticMarkup(renderTree(ambiguousPreview))).toContain(
    "Several similar articles were found.",
  );

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

  expect(markup).toContain("No reliable article match was found.");
  expect(markup).toContain("No description");

  const articleSelect = findControlByLabel(
    tree,
    "Accounting article/item",
    "select",
  );
  hostProps(articleSelect).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0]).toMatchObject({
    articleDecision: "existing",
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
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
