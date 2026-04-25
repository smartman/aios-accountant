import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { InvoiceImportDraft } from "@/lib/invoice-import-types";
import {
  buildPreview,
  buildRow,
  findButton,
  findControlByLabel,
  hostProps,
  renderTree,
} from "./InvoiceImportRowEditorTestUtils";

it("updates review and description fields", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const reviewedCheckbox = findControlByLabel(tree, "Reviewed", "input");
  hostProps(reviewedCheckbox).onChange?.({
    target: { checked: true },
  });
  expect(updates.at(-1)?.rows[0].reviewed).toBe(true);

  const descriptionInput = findControlByLabel(tree, "Description", "input");
  hostProps(descriptionInput).onChange?.({
    target: { value: "Updated description" },
  });
  expect(updates.at(-1)?.rows[0].description).toBe("Updated description");
});

it("shows manual review guidance for unclear extracted rows", () => {
  const preview = buildPreview({
    needsManualReview: true,
    manualReviewReason: "Amount is partially obscured.",
  });

  const markup = renderToStaticMarkup(renderTree(preview));

  expect(markup).toContain("Needs manual fix");
  expect(markup).toContain("Amount is partially obscured.");
});

it("updates row units", () => {
  const preview = buildPreview({
    selectedArticleCode: null,
    selectedArticleDescription: null,
  });
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const unitSelect = findControlByLabel(tree, "Unit", "select");
  hostProps(unitSelect).onChange?.({
    target: { value: "tk" },
  });
  expect(updates.at(-1)?.rows[0].unit).toBe("tk");

  hostProps(unitSelect).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].unit).toBeNull();
});

it("keeps the row unit editable even when the selected article has a unit", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const unitSelect = findControlByLabel(tree, "Unit", "select");
  expect(hostProps(unitSelect).disabled).not.toBe(true);

  hostProps(unitSelect).onChange?.({
    target: { value: "tk" },
  });
  expect(updates.at(-1)?.rows[0].unit).toBe("tk");
});

it("updates row numeric values", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain('value="145,08"');
  expect(markup).toContain("Row total with VAT");
  expect(
    hostProps(findControlByLabel(tree, "Row total with VAT", "output"))
      .children,
  ).toBe("179,90");

  const quantityInput = findControlByLabel(tree, "Quantity", "input");
  hostProps(quantityInput).onChange?.({
    target: { value: "3" },
  });
  expect(updates.at(-1)?.rows[0].quantity).toBe(3);

  hostProps(quantityInput).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].quantity).toBe(0);

  const priceInput = findControlByLabel(tree, "Price", "input");
  hostProps(priceInput).onChange?.({
    target: { value: "199.5" },
  });
  expect(updates.at(-1)?.rows[0].price).toBe(199.5);

  hostProps(priceInput).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].price).toBeNull();

  const sumInput = findControlByLabel(tree, "Net row amount", "input");
  hostProps(sumInput).onChange?.({
    target: { value: "598.5" },
  });
  expect(updates.at(-1)?.rows[0].sum).toBe(598.5);

  hostProps(sumInput).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].sum).toBeNull();
});

it("falls back to the extracted row VAT rate for the VAT-inclusive total", () => {
  const tree = renderTree(
    buildPreview({
      price: 100,
      sum: 100,
      taxCode: "UNKNOWN",
      vatRate: 22,
    }),
  );
  const noVatTree = renderTree(
    buildPreview({
      price: 100,
      sum: 100,
      taxCode: null,
      vatRate: null,
    }),
  );

  expect(
    hostProps(findControlByLabel(tree, "Row total with VAT", "output"))
      .children,
  ).toBe("122,00");
  expect(
    hostProps(findControlByLabel(noVatTree, "Row total with VAT", "output"))
      .children,
  ).toBe("100,00");
});

it("updates accounting fields", () => {
  const preview = buildPreview();
  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain("Purchase account");
  expect(markup).toContain("Search purchase accounts");
  expect(markup).toContain("Search VAT codes");
  expect(markup).toContain(
    'aria-label="Why this account? Matched machinery and equipment account."',
  );
  expect(markup).not.toContain("Why this account?</summary>");

  const accountSelect = findControlByLabel(tree, "Purchase account", "select");
  hostProps(accountSelect).onChange?.({
    target: { value: "4000" },
  });
  expect(updates.at(-1)?.rows[0].accountCode).toBe("4000");

  const vatSelect = findControlByLabel(tree, "VAT code", "select");
  hostProps(vatSelect).onChange?.({
    target: { value: "VAT0" },
  });
  expect(updates.at(-1)?.rows[0].taxCode).toBe("VAT0");

  hostProps(vatSelect).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].taxCode).toBeNull();
});

it("falls back cleanly when optional row values are missing", () => {
  const preview = buildPreview({
    sourceArticleCode: null,
    unit: null,
    price: null,
    sum: null,
    taxCode: null,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
  });
  preview.unitOptions = undefined;

  const updates: InvoiceImportDraft[] = [];
  const tree = renderTree(preview, (draft) => updates.push(draft));

  const unitSelect = findControlByLabel(tree, "Unit", "select");
  hostProps(unitSelect).onChange?.({
    target: { value: "" },
  });
  expect(updates.at(-1)?.rows[0].unit).toBeNull();

  const vatSelect = findControlByLabel(tree, "VAT code", "select");
  expect(hostProps(vatSelect).children).toBeDefined();
  expect(renderToStaticMarkup(tree)).toContain("Search VAT codes");
});

it("removes rows only when another row still exists", () => {
  const removablePreview = buildPreview();
  const secondRow = buildRow({
    id: "row-2",
    sourceArticleCode: null,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
  });
  removablePreview.draft.rows = [removablePreview.draft.rows[0], secondRow];

  const updates: InvoiceImportDraft[] = [];
  const removableTree = (
    <>{renderTree(removablePreview, (draft) => updates.push(draft))}</>
  );
  const removeButton = findButton(removableTree, "Remove");
  if (!removeButton) {
    throw new Error("Expected remove button.");
  }

  expect(hostProps(removeButton).disabled).toBe(false);
  hostProps(removeButton).onClick?.();
  expect(updates.at(-1)?.rows).toHaveLength(1);

  const disabledRemoveButton = findButton(renderTree(buildPreview()), "Remove");
  if (!disabledRemoveButton) {
    throw new Error("Expected disabled remove button.");
  }

  expect(hostProps(disabledRemoveButton).disabled).toBe(true);
  hostProps(disabledRemoveButton).onClick?.();
});
