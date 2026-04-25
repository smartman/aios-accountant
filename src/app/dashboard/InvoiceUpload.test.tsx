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

vi.mock("./actions", () => ({
  clearAccountingConnectionCache: vi.fn(async (state: unknown) => state),
  clearAccountingConnectionCacheFromForm: vi.fn(async () => undefined),
}));

interface HookHarness {
  render: (props: {
    canImport: boolean;
    activeProvider: "smartaccounts" | "merit" | null;
  }) => ReturnType<typeof import("react").createElement>;
  states: unknown[];
}

async function loadInvoiceUploadHarness(): Promise<HookHarness> {
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

  const invoiceUploadModule = await import("./InvoiceUpload");

  return {
    states,
    render(props) {
      hookIndex = 0;
      return invoiceUploadModule.default(props);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("react");
});

async function flushAsyncWork() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

it("keeps provider switching out of the import card", async () => {
  const { render } = await loadInvoiceUploadHarness();
  const markup = renderToStaticMarkup(
    render({ canImport: true, activeProvider: "merit" }),
  );

  expect(markup).toContain("Imported invoices will be sent to Merit.");
  expect(markup).toContain("Import invoice");
  expect(markup).not.toContain("Change accounting provider");
});

it("shows the setup message and short-circuits import when no provider or file is available", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");
  const { render } = await loadInvoiceUploadHarness();
  const tree = render({ canImport: false, activeProvider: null });
  const markup = renderToStaticMarkup(tree);

  expect(markup).toContain(
    "Save and validate a Merit or SmartAccounts connection before importing invoices.",
  );
  expect(hostProps(findFirstElementByTag(tree, "input")).disabled).toBe(true);
  expect(hostProps(findButton(tree, "Import invoice")!).disabled).toBe(true);

  await hostProps(findButton(tree, "Import invoice")!).onClick?.();

  expect(fetchMock).not.toHaveBeenCalled();
});

it("loads preview state, confirms imports, and resets state when a new file is selected", async () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const importedResult: ImportedInvoiceResult = {
    provider: "smartaccounts",
    invoiceId: "invoice-1",
    invoiceNumber: "INV-1",
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
  const file = new File(["invoice"], "invoice.pdf", {
    type: "application/pdf",
  });
  const replacementFile = new File(["next"], "next.pdf", {
    type: "application/pdf",
  });
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      ok: true,
      json: async () => preview satisfies InvoiceImportPreviewResult,
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => importedResult,
    } as Response);
  const { render, states } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.({
    target: { files: [file] },
  });

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  await hostProps(findButton(tree, "Import invoice")!).onClick?.();
  await Promise.resolve();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(states[4]).toMatchObject({ provider: "smartaccounts" });
  expect(states[5]).toMatchObject({ invoice: { invoiceNumber: "INV-1" } });

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Review before import");
  expect(renderToStaticMarkup(tree)).toContain("Open full screen");
  expect(renderToStaticMarkup(tree)).toContain("Preview of invoice.pdf");
  expect(states[8]).toBe(false);

  hostProps(findButton(tree, "Open full screen")!).onClick?.();
  expect(states[8]).toBe(true);

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Close preview");

  hostProps(findButton(tree, "Close preview")!).onClick?.();
  expect(states[8]).toBe(false);

  hostProps(findButton(tree, "Confirm and create invoice")!).onClick?.();
  await flushAsyncWork();

  expect(fetchMock).toHaveBeenCalledTimes(2);

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain("Invoice imported");

  hostProps(findFirstElementByTag(tree, "input")).onChange?.({
    target: { files: [replacementFile] },
  });

  expect(states[0]).toBe(replacementFile);
  expect(states[4]).toBeNull();
  expect(states[5]).toBeNull();
  expect(states[6]).toBeNull();
  expect(states[8]).toBe(false);
});

it("shows import and confirm errors from failed requests", async () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const file = new File(["invoice"], "invoice.pdf", {
    type: "application/pdf",
  });
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Import failed." }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => preview,
    } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Confirm failed." }),
    } as Response);
  const { render } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: true, activeProvider: "merit" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.({
    target: { files: [file] },
  });
  tree = render({ canImport: true, activeProvider: "merit" });
  await hostProps(findButton(tree, "Import invoice")!).onClick?.();
  await Promise.resolve();

  tree = render({ canImport: true, activeProvider: "merit" });
  expect(renderToStaticMarkup(tree)).toContain("Import failed.");

  hostProps(findButton(tree, "Import invoice")!).onClick?.();
  await flushAsyncWork();
  tree = render({ canImport: true, activeProvider: "merit" });
  expect(renderToStaticMarkup(tree)).toContain("Review before import");

  hostProps(findButton(tree, "Confirm and create invoice")!).onClick?.();
  await flushAsyncWork();

  tree = render({ canImport: true, activeProvider: "merit" });
  const markup = renderToStaticMarkup(tree);
  expect(markup).toContain("Confirm failed.");
  expect(markup.split("Confirm failed.")).toHaveLength(3);
});

it("falls back to the generic network error message for non-Error throws", async () => {
  const preview = buildPreview({
    reviewed: true,
  });
  const file = new File(["invoice"], "invoice.pdf", {
    type: "application/pdf",
  });
  vi.spyOn(globalThis, "fetch")
    .mockRejectedValueOnce("boom")
    .mockResolvedValueOnce({
      ok: true,
      json: async () => preview,
    } as Response)
    .mockRejectedValueOnce("boom");
  const { render, states } = await loadInvoiceUploadHarness();

  let tree = render({ canImport: true, activeProvider: "smartaccounts" });
  hostProps(findFirstElementByTag(tree, "input")).onChange?.({
    target: { files: [file] },
  });

  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  await hostProps(findButton(tree, "Import invoice")!).onClick?.();
  await flushAsyncWork();
  tree = render({ canImport: true, activeProvider: "smartaccounts" });
  expect(renderToStaticMarkup(tree)).toContain(
    "Network error — please try again.",
  );

  await hostProps(findButton(tree, "Import invoice")!).onClick?.();
  await flushAsyncWork();
  tree = render({ canImport: true, activeProvider: "smartaccounts" });

  hostProps(findButton(tree, "Confirm and create invoice")!).onClick?.();
  await flushAsyncWork();
  tree = render({ canImport: true, activeProvider: "smartaccounts" });

  expect(renderToStaticMarkup(tree)).toContain(
    "Network error — please try again.",
  );

  hostProps(findFirstElementByTag(tree, "input")).onChange?.({
    target: { files: [] },
  });

  expect(states[0]).toBeNull();
});
