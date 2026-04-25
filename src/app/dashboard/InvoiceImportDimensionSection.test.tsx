import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import InvoiceImportDimensionSection from "./InvoiceImportDimensionSection";
import {
  buildPreview,
  findFirstElementByTag,
  hostProps,
} from "./InvoiceImportRowEditorTestUtils";

function buildDraft(): InvoiceImportDraft {
  return buildPreview({ reviewed: true }).draft;
}

function buildPreviewWithDimensions(): InvoiceImportPreviewResult {
  return {
    ...buildPreview({ reviewed: true }),
    referenceData: {
      ...buildPreview({ reviewed: true }).referenceData,
      dimensions: [
        {
          code: "OBJ-1",
          name: "OBJ-1 - Office build",
        },
      ],
    },
  };
}

describe("InvoiceImportDimensionSection", () => {
  it("does not render when the provider has no dimensions", () => {
    const markup = renderToStaticMarkup(
      <InvoiceImportDimensionSection
        preview={buildPreview({ reviewed: true })}
        draft={buildDraft()}
        setDraft={() => undefined}
      />,
    );

    expect(markup).toBe("");
  });

  it("allows selecting and clearing the invoice dimension", () => {
    const preview = buildPreviewWithDimensions();
    let draft = buildDraft();
    const tree = (
      <InvoiceImportDimensionSection
        preview={preview}
        draft={draft}
        setDraft={(nextDraft) => {
          draft = nextDraft;
        }}
      />
    );
    const select = findFirstElementByTag(tree, "select");

    expect(renderToStaticMarkup(tree)).toContain("Project or object");
    hostProps(select).onChange?.({ target: { value: "OBJ-1" } });
    expect(draft.dimension).toEqual({
      code: "OBJ-1",
      name: "OBJ-1 - Office build",
      reason: "Selected during import review.",
    });

    hostProps(select).onChange?.({ target: { value: "" } });
    expect(draft.dimension).toEqual({
      code: null,
      name: null,
      reason: null,
    });
  });
});
