import { expect, it } from "vitest";
import {
  buildPreview,
  buildRow,
  findButton,
  hostProps,
} from "./InvoiceImportRowEditorTestUtils";
import { RowsSection } from "./InvoiceImportRowsSection";

it("renders imported rows and adds a new blank row during review", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const updates: (typeof preview.draft)[] = [];
  const tree = (
    <RowsSection
      preview={preview}
      draft={preview.draft}
      setDraft={(draft) => updates.push(draft)}
    />
  );
  const addButton = findButton(tree, "Add row");

  if (!addButton) {
    throw new Error("Expected add row button.");
  }

  hostProps(addButton).onClick?.();

  expect(updates.at(-1)?.rows).toHaveLength(2);
  expect(updates.at(-1)?.rows[1]).toMatchObject({
    id: "row-2",
    description: "",
    accountCode: "10921",
  });
});

it("accepts all imported rows at once", () => {
  const preview = buildPreview({
    reviewed: false,
  });
  preview.draft.rows = [
    preview.draft.rows[0],
    buildRow({ id: "row-2", reviewed: false }),
  ];
  const updates: (typeof preview.draft)[] = [];
  const tree = (
    <RowsSection
      preview={preview}
      draft={preview.draft}
      setDraft={(draft) => updates.push(draft)}
    />
  );
  const acceptAllButton = findButton(tree, "Accept all line items");

  if (!acceptAllButton) {
    throw new Error("Expected accept all line items button.");
  }

  hostProps(acceptAllButton).onClick?.();

  expect(updates.at(-1)?.rows.map((row) => row.reviewed)).toEqual([true, true]);
});

it("disables the bulk accept action when every row is already reviewed", () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const tree = (
    <RowsSection
      preview={preview}
      draft={preview.draft}
      setDraft={() => undefined}
    />
  );

  expect(hostProps(findButton(tree, "Accept all line items")!).disabled).toBe(
    true,
  );
});
