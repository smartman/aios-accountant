import { afterEach, expect, it, vi } from "vitest";
import { buildPreview } from "./InvoiceImportRowEditorTestUtils";
import type {
  InvoiceBatchItem,
  InvoiceUploadBatchState,
} from "./invoice-upload-batch";

const blobMocks = vi.hoisted(() => ({
  upload: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  upload: blobMocks.upload,
}));

interface HookHarness {
  cleanupEffects: () => void;
  renderController: () => Promise<{
    controller: ReturnType<
      (typeof import("./invoice-upload-controller"))["useInvoiceUploadController"]
    >;
    revokeFilePreviewUrl: (typeof import("./invoice-upload-controller"))["revokeFilePreviewUrl"];
  }>;
  states: unknown[];
}

type DeferredResponse = {
  reject: (error: unknown) => void;
  resolve: (response: Response) => void;
};

async function loadControllerHarness(
  initialState: InvoiceUploadBatchState,
): Promise<HookHarness> {
  vi.resetModules();

  const states: unknown[] = [initialState];
  const effectCleanups: Array<() => void> = [];
  const refs: Array<{ current: unknown }> = [];
  let hookIndex = 0;
  let refIndex = 0;

  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return {
      ...actual,
      useEffect: vi.fn((effect: () => void | (() => void)) => {
        const cleanup = effect();
        if (typeof cleanup === "function") {
          effectCleanups.push(cleanup);
        }
      }),
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
    cleanupEffects() {
      effectCleanups.forEach((cleanup) => cleanup());
    },
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

async function flushAsyncWork() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function waitForCondition(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await flushAsyncWork();
    }
  }
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
  blobMocks.upload.mockReset();
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

it("uses temporary blob storage for oversized invoice previews", async () => {
  blobMocks.upload.mockResolvedValue({
    url: "https://blob.test/invoice.jpg",
    downloadUrl: "https://blob.test/invoice.jpg?download=1",
    pathname: "invoice-import/company-1/invoice.jpg",
    contentType: "image/jpeg",
    contentDisposition: "",
    etag: "etag",
  });
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      ...buildPreview({ reviewed: true }),
      draft: buildPreview({ reviewed: true }).draft,
    }),
  );
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.handleFileChange([
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.jpg", {
      type: "image/jpeg",
    }),
  ]);

  await waitForCondition(() => {
    const batch = states[0] as InvoiceUploadBatchState;
    expect(batch.items[0].status).toBe("ready");
  });
  expect(blobMocks.upload).toHaveBeenCalledOnce();
  const body = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
  expect(body.get("invoice")).toBeNull();
  expect(String(body.get("invoiceBlob"))).toContain(
    "invoice-import/company-1/invoice.jpg",
  );
});

it("reports Vercel 413 responses without parsing them as JSON", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("Request Entity Too Large", {
      status: 413,
      headers: { "content-type": "text/plain" },
    }),
  );
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.handleFileChange([
    new File(["invoice"], "invoice.jpg", { type: "image/jpeg" }),
  ]);

  await waitForCondition(() => {
    const batch = states[0] as InvoiceUploadBatchState;
    expect(batch.items[0].status).toBe("failed");
    expect(batch.items[0].error).toContain("Vercel deployment");
  });
});

it("uses the upload limit message for JSON Vercel 413 responses", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ message: "FUNCTION_PAYLOAD_TOO_LARGE" }, { status: 413 }),
  );
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.handleFileChange([
    new File(["invoice"], "invoice.jpg", { type: "image/jpeg" }),
  ]);

  await waitForCondition(() => {
    const batch = states[0] as InvoiceUploadBatchState;
    expect(batch.items[0].status).toBe("failed");
    expect(batch.items[0].error).toContain("Vercel deployment");
  });
});

it("surfaces non-json import failures from the endpoint", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("Gateway unavailable", {
      status: 502,
      headers: { "content-type": "text/plain" },
    }),
  );
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.handleFileChange([
    new File(["invoice"], "invoice.jpg", { type: "image/jpeg" }),
  ]);

  await waitForCondition(() => {
    const batch = states[0] as InvoiceUploadBatchState;
    expect(batch.items[0].status).toBe("failed");
    expect(batch.items[0].error).toBe("Gateway unavailable");
  });
});

it("uses fallback errors for unexpected import responses", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
  );
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.handleFileChange([
    new File(["invoice"], "invoice.jpg", { type: "image/jpeg" }),
  ]);

  await waitForCondition(() => {
    const batch = states[0] as InvoiceUploadBatchState;
    expect(batch.items[0].status).toBe("failed");
    expect(batch.items[0].error).toBe("Import failed.");
  });
});

it("uses fallback errors when JSON failures omit an error message", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ message: "No error field" }, { status: 500 }),
  );
  const { renderController, states } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();

  controller.handleFileChange([
    new File(["invoice"], "invoice.jpg", { type: "image/jpeg" }),
  ]);

  await waitForCondition(() => {
    const batch = states[0] as InvoiceUploadBatchState;
    expect(batch.items[0].status).toBe("failed");
    expect(batch.items[0].error).toBe("Import failed.");
  });
});

it("cancels queued preview requests when the controller unmounts", async () => {
  const deferredResponses: DeferredResponse[] = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    (_input, init) =>
      new Promise<Response>((resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
        deferredResponses.push({ reject, resolve });
      }),
  );
  const { cleanupEffects, renderController } = await loadControllerHarness({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  const { controller } = await renderController();
  const files = Array.from(
    { length: 5 },
    (_, index) =>
      new File([`invoice-${index}`], `invoice-${index}.pdf`, {
        type: "application/pdf",
      }),
  );

  controller.handleFileChange(files);
  await waitForCondition(() => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  cleanupEffects();
  await flushAsyncWork();

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(deferredResponses).toHaveLength(3);
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
