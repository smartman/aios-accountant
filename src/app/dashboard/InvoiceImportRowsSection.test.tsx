import { expect, it } from "vitest";
import {
  buildPreview,
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
    articleDecision: "existing",
  });
});
