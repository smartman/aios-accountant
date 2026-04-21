import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import InvoiceImportRowEditor from "./InvoiceImportRowEditor";
import { buildPreview } from "./InvoiceImportRowEditorTestUtils";

it("wraps the row editor body in the card container", () => {
  const preview = buildPreview();
  const markup = renderToStaticMarkup(
    <InvoiceImportRowEditor
      draft={preview.draft}
      row={preview.draft.rows[0]}
      preview={preview}
      setDraft={() => undefined}
    />,
  );

  expect(markup).toContain("rounded-[18px]");
  expect(markup).toContain("Article match");
});
