import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
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

async function loadReviewHarness() {
  vi.resetModules();

  const states: unknown[] = [];
  let hookIndex = 0;
  const useStateMock = vi.fn((initialState: unknown) => {
    const currentIndex = hookIndex++;
    if (!(currentIndex in states)) {
      states[currentIndex] =
        typeof initialState === "function"
          ? (initialState as () => unknown)()
          : initialState;
    }

    const setState = (nextState: unknown) => {
      states[currentIndex] =
        typeof nextState === "function"
          ? (nextState as (previous: unknown) => unknown)(states[currentIndex])
          : nextState;
    };

    return [states[currentIndex], setState] as const;
  });

  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return {
      ...actual,
      useState: useStateMock,
    };
  });

  const reviewModule = await import("./InvoiceImportReview");

  return {
    states,
    render(params?: {
      draft?: InvoiceImportDraft;
      onConfirm?: () => void;
      preview?: InvoiceImportPreviewResult;
    }) {
      hookIndex = 0;
      const preview = params?.preview ?? buildValidPreview();
      const draft = params?.draft ?? preview.draft;
      const file = new File(["invoice"], "invoice.pdf", {
        type: "application/pdf",
      });

      return reviewModule.default({
        file,
        filePreviewUrl: null,
        isPreviewLightboxOpen: false,
        onOpenPreviewLightbox: () => undefined,
        onClosePreviewLightbox: () => undefined,
        preview,
        draft,
        setDraft: () => undefined,
        confirming: false,
        onConfirm: params?.onConfirm ?? (() => undefined),
      });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("react");
});

it("renders duplicate and warning summaries and blocks confirm when validation fails", async () => {
  const { render } = await loadReviewHarness();
  const preview = buildValidPreview();
  preview.draft.warnings = ["Check vendor details."];
  preview.draft.duplicateInvoice = {
    invoiceId: "invoice-dup",
    vendorName: "Vendor OÜ",
    invoiceNumber: "INV-1",
  };
  preview.draft.vendor.name = "";

  const tree = render({ preview });
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

it("shows the missing-article warning and cache-clear action for unresolved rows", async () => {
  const { render } = await loadReviewHarness();
  const preview = buildValidPreview();
  preview.draft.rows[0].suggestionStatus = "missing";
  preview.draft.rows[0].selectedArticleCode = null;
  preview.draft.rows[0].selectedArticleDescription = null;

  const markup = renderToStaticMarkup(render({ preview }));

  expect(markup).toContain(
    "Article not detected, choose manually or create new article and refresh the article cache.",
  );
  expect(markup).toContain("Clear article cache");
});

it("shows a derived warning when invoice header amounts do not match the rows", async () => {
  const { render } = await loadReviewHarness();
  const preview = buildValidPreview();
  preview.draft.invoice.amountExcludingVat = 120;
  preview.draft.invoice.vatAmount = 26.4;
  preview.draft.invoice.totalAmount = 146.4;

  const markup = renderToStaticMarkup(render({ preview }));

  expect(markup).toContain(
    "Invoice header amounts do not match the invoice rows: Net amount 120,00 vs rows 145,08; VAT amount 26,40 vs rows 34,82; Total amount 146,40 vs rows 179,90.",
  );
});

it("opens a duplicate confirmation dialog before proceeding", async () => {
  const { render, states } = await loadReviewHarness();
  const preview = buildValidPreview();
  preview.draft.duplicateInvoice = {
    invoiceId: "invoice-dup",
    vendorName: "Vendor OÜ",
    invoiceNumber: "INV-1",
  };
  const confirmSpy = vi.fn();
  let tree = render({
    preview,
    onConfirm: confirmSpy,
  });
  const confirmButton = findButton(tree, "Confirm and create invoice");

  if (!confirmButton) {
    throw new Error("Expected confirm button.");
  }

  hostProps(confirmButton).onClick?.();
  expect(states[0]).toBe(true);
  expect(confirmSpy).not.toHaveBeenCalled();

  tree = render({
    preview,
    onConfirm: confirmSpy,
  });
  expect(renderToStaticMarkup(tree)).toContain("Possible duplicate invoice");

  const proceedButton = findButton(tree, "Create anyway");
  if (!proceedButton) {
    throw new Error("Expected duplicate confirmation button.");
  }

  hostProps(proceedButton).onClick?.();
  expect(confirmSpy).toHaveBeenCalledTimes(1);
  expect(states[0]).toBe(false);
});
