import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import InvoiceImportReview from "./InvoiceImportReview";
import {
  buildPreview,
  findButton,
  hostProps,
} from "./InvoiceImportRowEditorTestUtils";

vi.mock("./actions", () => ({
  clearAccountingConnectionCache: vi.fn(async (state: unknown) => state),
  clearAccountingConnectionCacheFromForm: vi.fn(async () => undefined),
}));

function buildValidPreview(): InvoiceImportPreviewResult {
  const preview = buildPreview({
    reviewed: true,
  });
  preview.draft.rows[0].reviewed = true;
  return preview;
}

function renderReview(params?: {
  draft?: InvoiceImportDraft;
  onConfirm?: () => void;
  preview?: InvoiceImportPreviewResult;
}) {
  const preview = params?.preview ?? buildValidPreview();
  const draft = params?.draft ?? preview.draft;
  const file = new File(["invoice"], "invoice.pdf", {
    type: "application/pdf",
  });

  return (
    <InvoiceImportReview
      file={file}
      filePreviewUrl={null}
      isPreviewLightboxOpen={false}
      onOpenPreviewLightbox={() => undefined}
      onClosePreviewLightbox={() => undefined}
      preview={preview}
      draft={draft}
      setDraft={() => undefined}
      confirming={false}
      onConfirm={params?.onConfirm ?? (() => undefined)}
    />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
});

it("renders duplicate and warning summaries and blocks confirm when validation fails", () => {
  const preview = buildValidPreview();
  preview.draft.warnings = ["Check vendor details."];
  preview.draft.duplicateInvoice = {
    invoiceId: "invoice-dup",
    vendorName: "Vendor OÜ",
    invoiceNumber: "INV-1",
  };
  preview.draft.vendor.name = "";

  const tree = renderReview({ preview });
  const markup = renderToStaticMarkup(tree);
  const confirmButton = findButton(tree, "Confirm and create invoice");

  if (!confirmButton) {
    throw new Error("Expected confirm button.");
  }

  expect(markup).toContain("Possible duplicate: Vendor OÜ —");
  expect(markup).toContain("INV-1");
  expect(markup).toContain("Check vendor details.");
  expect(markup).toContain("Vendor name is required.");
  expect(markup).toContain("cannot be previewed inline");
  expect(hostProps(confirmButton).disabled).toBe(true);
});

it("shows the missing-article warning and cache-clear action for unresolved rows", () => {
  const preview = buildValidPreview();
  preview.draft.rows[0].suggestionStatus = "missing";
  preview.draft.rows[0].selectedArticleCode = null;
  preview.draft.rows[0].selectedArticleDescription = null;

  const markup = renderToStaticMarkup(renderReview({ preview }));

  expect(markup).toContain(
    "Article not detected, choose manually or create new article and refresh the article cache.",
  );
  expect(markup).toContain("Clear article cache");
});

it("prompts before confirming duplicates and respects the user's choice", () => {
  const preview = buildValidPreview();
  preview.draft.duplicateInvoice = {
    invoiceId: "invoice-dup",
    vendorName: "Vendor OÜ",
    invoiceNumber: "INV-1",
  };
  const confirmSpy = vi.fn();
  const windowConfirm = vi
    .fn()
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  Object.assign(globalThis, {
    window: { confirm: windowConfirm },
  });

  const tree = renderReview({
    preview,
    onConfirm: confirmSpy,
  });
  const confirmButton = findButton(tree, "Confirm and create invoice");

  if (!confirmButton) {
    throw new Error("Expected confirm button.");
  }

  hostProps(confirmButton).onClick?.();
  hostProps(confirmButton).onClick?.();

  expect(windowConfirm).toHaveBeenCalledTimes(2);
  expect(confirmSpy).toHaveBeenCalledTimes(1);
});
