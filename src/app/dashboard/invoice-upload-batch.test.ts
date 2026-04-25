import { afterEach, expect, it } from "vitest";
import {
  __resetInvoicePreviewLimiterForTests,
  createInitialInvoiceUploadBatchState,
  createInvoiceBatchItem,
  enqueueInvoicePreview,
  findActiveBatchItem,
  findNextReadyItemId,
  getFilesFromInput,
  getItemErrorMessage,
  resolveActiveItemId,
  updateInvoiceBatchItem,
} from "./invoice-upload-batch";

type DeferredTask = {
  resolve: (value: string) => void;
};

function buildFile(name = "invoice.pdf") {
  return new File(["invoice"], name, { type: "application/pdf" });
}

function buildItem(
  status: ReturnType<typeof createInvoiceBatchItem>["status"],
) {
  const item = createInvoiceBatchItem(buildFile(`${status}.pdf`), null);
  return { ...item, status };
}

async function waitForCondition(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
}

afterEach(() => {
  __resetInvoicePreviewLimiterForTests();
});

it("creates initial state and normalizes file input", () => {
  const file = buildFile();

  expect(createInitialInvoiceUploadBatchState()).toEqual({
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  });
  expect(createInvoiceBatchItem(file, "blob:invoice")).toMatchObject({
    id: "invoice-batch-item-1",
    file,
    filePreviewUrl: "blob:invoice",
    status: "queued",
    error: null,
  });
  expect(getFilesFromInput([file])).toEqual([file]);
  expect(getFilesFromInput(null)).toEqual([]);
});

it("updates, finds, and chooses active invoice items", () => {
  const queued = buildItem("queued");
  const processing = buildItem("processing");
  const failed = buildItem("failed");
  const ready = buildItem("ready");
  const confirmed = buildItem("confirmed");
  const items = [queued, processing, failed, ready, confirmed];

  expect(findActiveBatchItem(items, ready.id)).toBe(ready);
  expect(findActiveBatchItem(items, "missing")).toBeNull();
  expect(findNextReadyItemId(items, queued.id)).toBe(ready.id);
  expect(resolveActiveItemId(items, failed.id)).toBe(ready.id);
  expect(resolveActiveItemId(items, processing.id)).toBe(processing.id);
  expect(resolveActiveItemId([confirmed], confirmed.id)).toBe(confirmed.id);
  expect(resolveActiveItemId([], null)).toBeNull();
  expect(
    updateInvoiceBatchItem(items, queued.id, (item) => ({
      ...item,
      status: "ready",
    }))[0].status,
  ).toBe("ready");
});

it("formats generic import errors", () => {
  expect(getItemErrorMessage(new Error("Bad scan."))).toBe("Bad scan.");
  expect(getItemErrorMessage("boom")).toBe("Network error - please try again.");
});

it("limits preview work to three active tasks", async () => {
  const deferredTasks: DeferredTask[] = [];
  let startedTasks = 0;
  const tasks = Array.from({ length: 5 }, (_, index) =>
    enqueueInvoicePreview(() =>
      new Promise<string>((resolve) => {
        startedTasks += 1;
        deferredTasks.push({ resolve });
      }).then(() => `invoice-${index}`),
    ),
  );

  await waitForCondition(() => {
    expect(startedTasks).toBe(3);
  });

  deferredTasks.splice(0, 3).forEach((deferred) => {
    deferred.resolve("done");
  });
  await waitForCondition(() => {
    expect(startedTasks).toBe(5);
  });

  deferredTasks.splice(0, 2).forEach((deferred) => {
    deferred.resolve("done");
  });

  await expect(Promise.all(tasks)).resolves.toEqual([
    "invoice-0",
    "invoice-1",
    "invoice-2",
    "invoice-3",
    "invoice-4",
  ]);
});
