import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type {
  ImportedInvoiceResult,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  buildPreview,
  findButton,
  findFirstElementByTag,
  hostProps,
} from "./InvoiceImportRowEditorTestUtils";
import {
  __resetInvoicePreviewLimiterForTests,
  InvoiceBatchItem,
  InvoiceUploadBatchState,
} from "./invoice-upload-batch";

vi.mock("./actions", () => ({
  clearAccountingConnectionCache: vi.fn(async (state: unknown) => state),
  clearAccountingConnectionCacheFromForm: vi.fn(async () => undefined),
}));

interface HookHarness {
  render: (props: {
    canImport: boolean;
    activeProvider: "smartaccounts" | "merit" | null;
    companyId?: string;
  }) => ReturnType<typeof import("react").createElement>;
  cleanupEffects: () => void;
  states: unknown[];
}

type DeferredResponse = {
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

async function loadInvoiceUploadHarness(): Promise<HookHarness> {
  vi.resetModules();

  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const effectCleanups: Array<() => void> = [];
  let hookIndex = 0;
  let refIndex = 0;
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
  const useRefMock = vi.fn((initialValue: unknown) => {
    const currentIndex = refIndex++;
    refs[currentIndex] ??= { current: initialValue };
    return refs[currentIndex];
  });

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
      useRef: useRefMock,
      useState: useStateMock,
    };
  });

  const invoiceUploadModule = await import("./InvoiceUpload");

  return {
    cleanupEffects() {
      effectCleanups.forEach((cleanup) => cleanup());
    },
    states,
    render(props) {
      hookIndex = 0;
      refIndex = 0;
      return invoiceUploadModule.default(props);
    },
  };
}

function setupObjectUrlMocks() {
  const OriginalURL = URL;

  class MockURL extends OriginalURL {
    static createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    static revokeObjectURL = vi.fn();
  }

  vi.stubGlobal("URL", MockURL);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildImportedResult(
  preview: InvoiceImportPreviewResult,
  invoiceId = "invoice-1",
): ImportedInvoiceResult {
  return {
    provider: "smartaccounts",
    invoiceId,
    invoiceNumber: preview.draft.invoice.invoiceNumber,
    vendorId: "vendor-1",
    vendorName: "Vendor OÜ",
    createdVendor: false,
    attachedFile: true,
    createdPayment: false,
    paymentId: null,
    purchaseAccounts: [],
    paymentAccount: null,
    extraction: preview.extraction,
    alreadyExisted: false,
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

function selectedFilesEvent(files: File[]) {
  return {
    target: { files },
    currentTarget: { value: "" },
  };
}

function getBatchState(states: unknown[]): InvoiceUploadBatchState {
  return states[0] as InvoiceUploadBatchState;
}

function buildStatusItem(
  status: InvoiceBatchItem["status"],
  error: string | null = null,
): InvoiceBatchItem {
  return {
    id: `status-${status}`,
    file: new File(["invoice"], `${status}.pdf`, {
      type: "application/pdf",
    }),
    filePreviewUrl: null,
    status,
    preview: null,
    draft: null,
    result: null,
    error,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("react");
  vi.unstubAllGlobals();
  __resetInvoicePreviewLimiterForTests();
});

it("shows the setup message and disables file selection without a provider", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const { render } = await loadInvoiceUploadHarness();
  const tree = render({ canImport: false, activeProvider: null });
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain(
    "Save and validate a Merit or SmartAccounts connection before importing invoices.",
  );
  expect(hostProps(findFirstElementByTag(tree, "input")).disabled).toBe(true);
  expect(markup).toContain("Import invoices");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("ignores empty selections and selections made before import is available", async () => {
  setupObjectUrlMocks();
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const { render, states } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: false, activeProvider: null });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([
      new File(["invoice"], "blocked.pdf", { type: "application/pdf" }),
    ]),
  );

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([]),
  );

  expect(fetchMock).not.toHaveBeenCalled();
  expect(getBatchState(states).items).toHaveLength(0);
});

it("renders non-review active statuses", async () => {
  const { render, states } = await loadInvoiceUploadHarness();

  states[0] = {
    items: [buildStatusItem("queued")],
    activeItemId: "status-queued",
    lightboxItemId: null,
  } satisfies InvoiceUploadBatchState;
  expect(
    renderToStaticMarkup(
      render({ canImport: true, activeProvider: "smartaccounts" }),
    ),
  ).toContain("Waiting to prepare preview.");

  states[0] = {
    items: [buildStatusItem("confirming")],
    activeItemId: "status-confirming",
    lightboxItemId: null,
  } satisfies InvoiceUploadBatchState;
  expect(
    renderToStaticMarkup(
      render({ canImport: true, activeProvider: "smartaccounts" }),
    ),
  ).toContain("Saving invoice to accounting.");

  states[0] = {
    items: [buildStatusItem("failed")],
    activeItemId: "status-failed",
    lightboxItemId: null,
  } satisfies InvoiceUploadBatchState;
  expect(
    renderToStaticMarkup(
      render({ canImport: true, activeProvider: "smartaccounts" }),
    ),
  ).toContain("Preview failed.");
});

it("selects multiple files, appends later files, and keeps ready previews queued", async () => {
  setupObjectUrlMocks();
  const previewA = buildPreview({ reviewed: true });
  const previewB = buildPreview({ reviewed: true, description: "Second row" });
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(jsonResponse(previewA))
    .mockResolvedValueOnce(jsonResponse(previewB));
  const { render, states } = await loadInvoiceUploadHarness();
  const firstFile = new File(["one"], "one.pdf", { type: "application/pdf" });
  const secondFile = new File(["two"], "two.png", { type: "image/png" });

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  const input = findFirstElementByTag(tree, "input");
  expect(hostProps(input).multiple).toBe(true);

  hostProps(input).onChange?.(selectedFilesEvent([firstFile]));
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([secondFile]),
  );
  await flushAsyncWork();

  const batch = getBatchState(states);
  expect(batch.items).toHaveLength(2);
  expect(batch.items.map((item) => item.status)).toEqual(["ready", "ready"]);
  expect(batch.items[0].draft?.invoice.invoiceNumber).toBe("INV-1");
  expect(batch.items[1].file.name).toBe("two.png");

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  const markup = renderToStaticMarkup(tree);
  expect(markup).toContain("Invoice queue");
  expect(markup).toContain("Review before import");
  expect(markup).toContain("Ready");
});

it("limits preview requests to three active files at a time", async () => {
  setupObjectUrlMocks();
  const deferredResponses: DeferredResponse[] = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((resolve, reject) => {
        deferredResponses.push({ resolve, reject });
      }),
  );
  const { render } = await loadInvoiceUploadHarness();
  const files = Array.from(
    { length: 5 },
    (_, index) =>
      new File([`invoice-${index}`], `invoice-${index}.pdf`, {
        type: "application/pdf",
      }),
  );

  let tree = render({ canImport: true, activeProvider: "merit" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent(files),
  );
  tree = render({ canImport: true, activeProvider: "merit" });
  expect(renderToStaticMarkup(tree)).toContain("Preparing invoice preview.");
  expect(renderToStaticMarkup(tree)).toContain("Queued");

  await waitForCondition(() => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  deferredResponses.splice(0, 3).forEach((deferred) => {
    deferred.resolve(jsonResponse(buildPreview({ reviewed: true })));
  });
  await waitForCondition(() => {
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  deferredResponses.splice(0, 2).forEach((deferred) => {
    deferred.resolve(jsonResponse(buildPreview({ reviewed: true })));
  });
  await flushAsyncWork();
});

it("retries failed previews and shows confirmed results after saving", async () => {
  setupObjectUrlMocks();
  const failedResponse = new Response(JSON.stringify({ error: "Bad scan." }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
  const preview = buildPreview({ reviewed: true });
  const importedResult = buildImportedResult(preview);
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(failedResponse)
    .mockResolvedValueOnce(jsonResponse(preview))
    .mockResolvedValueOnce(jsonResponse(importedResult));
  const { render, states } = await loadInvoiceUploadHarness();
  const file = new File(["invoice"], "invoice.pdf", {
    type: "application/pdf",
  });

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([file]),
  );
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Bad scan.");

  hostProps(findButton(tree, "Retry invoice.pdf")!).onClick?.();
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Review before import");

  hostProps(findButton(tree, "Confirm and create invoice")!).onClick?.();
  await flushAsyncWork();

  const batch = getBatchState(states);
  expect(batch.items[0]).toMatchObject({
    status: "confirmed",
    result: { invoiceId: "invoice-1" },
  });

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Invoice imported");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:invoice.pdf");
});

it("uses the default preview error when the response has no message", async () => {
  setupObjectUrlMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({}), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const { render } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([
      new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    ]),
  );
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Import failed.");
});

it("keeps a ready preview active when confirmation fails", async () => {
  setupObjectUrlMocks();
  const preview = buildPreview({ reviewed: true });
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(jsonResponse(preview))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Confirm failed." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  const { render, states } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([
      new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    ]),
  );
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findButton(tree, "Confirm and create invoice")!).onClick?.();
  await flushAsyncWork();

  const batch = getBatchState(states);
  expect(batch.items[0]).toMatchObject({
    status: "ready",
    error: "Confirm failed.",
  });
});

it("opens and closes the active preview lightbox and revokes URLs on cleanup", async () => {
  setupObjectUrlMocks();
  const preview = buildPreview({ reviewed: true });
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(preview));
  const { cleanupEffects, render, states } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([
      new File(["invoice"], "invoice.pdf", { type: "application/pdf" }),
    ]),
  );
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findButton(tree, "Open full screen")!).onClick?.();
  expect(getBatchState(states).lightboxItemId).toBe(
    getBatchState(states).items[0].id,
  );

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findButton(tree, "Close preview")!).onClick?.();
  expect(getBatchState(states).lightboxItemId).toBeNull();

  cleanupEffects();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:invoice.pdf");
});

it("confirms the active ready invoice and advances to the next preview", async () => {
  setupObjectUrlMocks();
  const previewA = buildPreview({ reviewed: true });
  const previewB = buildPreview({ reviewed: true, description: "Next row" });
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(jsonResponse(previewA))
    .mockResolvedValueOnce(jsonResponse(previewB))
    .mockResolvedValueOnce(jsonResponse(buildImportedResult(previewA)));
  const { render, states } = await loadInvoiceUploadHarness();
  const firstFile = new File(["one"], "one.pdf", { type: "application/pdf" });
  const secondFile = new File(["two"], "two.pdf", { type: "application/pdf" });

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.(
    selectedFilesEvent([firstFile, secondFile]),
  );
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findButton(tree, "Confirm and create invoice")!).onClick?.();
  await flushAsyncWork();

  const batch = getBatchState(states);
  expect(batch.items[0].status).toBe("confirmed");
  expect(batch.items[1].status).toBe("ready");
  expect(batch.activeItemId).toBe(batch.items[1].id);
});
