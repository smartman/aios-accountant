import { afterEach, expect, it, vi } from "vitest";
import { buildPreview } from "./InvoiceImportRowEditorTestUtils";
import type {
  InvoiceBatchItem,
  InvoiceUploadBatchState,
} from "./invoice-upload-batch";

interface HookHarness {
  renderController: () => Promise<{
    controller: ReturnType<
      (typeof import("./invoice-upload-controller"))["useInvoiceUploadController"]
    >;
    revokeFilePreviewUrl: (typeof import("./invoice-upload-controller"))["revokeFilePreviewUrl"];
  }>;
  states: unknown[];
}

async function loadControllerHarness(
  initialState: InvoiceUploadBatchState,
): Promise<HookHarness> {
  vi.resetModules();

  const states: unknown[] = [initialState];
  const refs: Array<{ current: unknown }> = [];
  let hookIndex = 0;
  let refIndex = 0;

  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return {
      ...actual,
      useEffect: vi.fn(),
      useRef: vi.fn((initialValue: unknown) => {
        const currentIndex = refIndex++;
        refs[currentIndex] ??= { current: initialValue };
        return refs[currentIndex];
      }),
      useState: vi.fn((initialStateValue: unknown) => {
        const currentIndex = hookIndex++;
        states[currentIndex] ??=
          typeof initialStateValue === "function"
            ? (initialStateValue as () => unknown)()
            : initialStateValue;

        return [
          states[currentIndex],
          (nextState: unknown) => {
            states[currentIndex] =
              typeof nextState === "function"
                ? (nextState as (previous: unknown) => unknown)(
                    states[currentIndex],
                  )
                : nextState;
          },
        ] as const;
      }),
    };
  });

  return {
    states,
    async renderController() {
      hookIndex = 0;
      refIndex = 0;
      const controllerModule = await import("./invoice-upload-controller");

      return {
        controller: controllerModule.useInvoiceUploadController({
          canImport: true,
          companyId: "company-1",
        }),
        revokeFilePreviewUrl: controllerModule.revokeFilePreviewUrl,
      };
    },
  };
}

function buildReadyItem(): InvoiceBatchItem {
  const preview = buildPreview({ reviewed: true });

  return {
    id: "item-1",
    file: new File(["invoice"], "invoice.pdf", {
      type: "application/pdf",
    }),
    filePreviewUrl: "blob:invoice.pdf",
    status: "ready",
    preview,
    draft: preview.draft,
    result: null,
    error: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("react");
  vi.unstubAllGlobals();
});

it("updates the active draft and lightbox state from the controller", async () => {
  const item = buildReadyItem();
  const { renderController, states } = await loadControllerHarness({
    items: [item],
    activeItemId: item.id,
    lightboxItemId: null,
  });
  const { controller } = await renderController();
  const nextDraft = {
    ...item.draft!,
    invoice: {
      ...item.draft!.invoice,
      invoiceNumber: "EDITED-1",
    },
  };

  controller.setActiveDraft(nextDraft);
  controller.setLightboxOpen(true);

  const batch = states[0] as InvoiceUploadBatchState;
  expect(batch.items[0].draft?.invoice.invoiceNumber).toBe("EDITED-1");
  expect(batch.lightboxItemId).toBe(item.id);
});

it("selects queue items and ignores retry requests for missing items", async () => {
  const item = buildReadyItem();
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const { renderController, states } = await loadControllerHarness({
    items: [item],
    activeItemId: item.id,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.selectItem("manual-selection");
  controller.retryItem("missing-item");

  const batch = states[0] as InvoiceUploadBatchState;
  expect(batch.activeItemId).toBe("manual-selection");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reports review visibility only when an active item has preview data", async () => {
  const readyItem = buildReadyItem();
  const confirmingItem = {
    ...buildReadyItem(),
    id: "confirming-item",
    status: "confirming" as const,
  };
  const missingPreviewItem = {
    ...buildReadyItem(),
    id: "missing-preview-item",
    preview: null,
  };

  const readyHarness = await loadControllerHarness({
    items: [readyItem],
    activeItemId: readyItem.id,
    lightboxItemId: null,
  });
  expect((await readyHarness.renderController()).controller.canShowReview).toBe(
    true,
  );

  const confirmingHarness = await loadControllerHarness({
    items: [confirmingItem],
    activeItemId: confirmingItem.id,
    lightboxItemId: null,
  });
  expect(
    (await confirmingHarness.renderController()).controller.canShowReview,
  ).toBe(true);

  const missingPreviewHarness = await loadControllerHarness({
    items: [missingPreviewItem],
    activeItemId: missingPreviewItem.id,
    lightboxItemId: null,
  });
  expect(
    (await missingPreviewHarness.renderController()).controller.canShowReview,
  ).toBe(false);
});

it("ignores draft and lightbox updates when no item is active", async () => {
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();
  const draft = buildPreview({ reviewed: true }).draft;

  controller.setActiveDraft(draft);
  controller.setLightboxOpen(true);

  expect(states[0]).toEqual({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
});

it("does not confirm when no ready invoice is active", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const { renderController } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  await controller.handleConfirm();

  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns early when revoking an empty preview URL", async () => {
  const { renderController } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { revokeFilePreviewUrl } = await renderController();

  expect(() => revokeFilePreviewUrl(null)).not.toThrow();
});
