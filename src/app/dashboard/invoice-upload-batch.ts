import type {
  ImportedInvoiceResult,
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";

export const MAX_PARALLEL_INVOICE_PREVIEWS = 3;

export type InvoiceBatchItemStatus =
  | "queued"
  | "processing"
  | "ready"
  | "confirming"
  | "confirmed"
  | "failed";

export interface InvoiceBatchItem {
  id: string;
  file: File;
  filePreviewUrl: string | null;
  status: InvoiceBatchItemStatus;
  preview: InvoiceImportPreviewResult | null;
  draft: InvoiceImportDraft | null;
  result: ImportedInvoiceResult | null;
  error: string | null;
}

export interface InvoiceUploadBatchState {
  items: InvoiceBatchItem[];
  activeItemId: string | null;
  lightboxItemId: string | null;
}

type QueuedPreviewTask = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let nextBatchItemIndex = 0;
let activePreviewTasks = 0;
const pendingPreviewTasks: QueuedPreviewTask[] = [];

export function createInitialInvoiceUploadBatchState(): InvoiceUploadBatchState {
  return {
    items: [],
    activeItemId: null,
    lightboxItemId: null,
  };
}

export function createInvoiceBatchItem(
  file: File,
  filePreviewUrl: string | null,
): InvoiceBatchItem {
  nextBatchItemIndex += 1;

  return {
    id: `invoice-batch-item-${nextBatchItemIndex}`,
    file,
    filePreviewUrl,
    status: "queued",
    preview: null,
    draft: null,
    result: null,
    error: null,
  };
}

export function getFilesFromInput(files: FileList | File[] | null): File[] {
  return Array.from(files ?? []);
}

export function getItemErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Network error - please try again.";
}

export function updateInvoiceBatchItem(
  items: InvoiceBatchItem[],
  itemId: string,
  updater: (item: InvoiceBatchItem) => InvoiceBatchItem,
): InvoiceBatchItem[] {
  return items.map((item) => (item.id === itemId ? updater(item) : item));
}

export function findActiveBatchItem(
  items: InvoiceBatchItem[],
  activeItemId: string | null,
): InvoiceBatchItem | null {
  return items.find((item) => item.id === activeItemId) ?? null;
}

export function findNextReadyItemId(
  items: InvoiceBatchItem[],
  afterItemId: string,
): string | null {
  const readyItems = items.filter((item) => item.status === "ready");
  const currentIndex = readyItems.findIndex((item) => item.id === afterItemId);
  const nextReadyItem = readyItems[currentIndex + 1] ?? readyItems[0];

  return nextReadyItem?.id ?? null;
}

export function resolveActiveItemId(
  items: InvoiceBatchItem[],
  currentActiveItemId: string | null,
): string | null {
  const currentItem = findActiveBatchItem(items, currentActiveItemId);
  const firstReadyItem = items.find((item) => item.status === "ready");

  if (currentItem && currentItem.status !== "confirmed") {
    if (currentItem.status !== "failed" || !firstReadyItem) {
      return currentItem.id;
    }
  }

  return (
    firstReadyItem?.id ??
    items.find((item) => item.status === "processing")?.id ??
    items.find((item) => item.status === "queued")?.id ??
    items.find((item) => item.status === "failed")?.id ??
    items.find((item) => item.status === "confirmed")?.id ??
    null
  );
}

export function countBatchItemsByStatus(items: InvoiceBatchItem[]) {
  return items.reduce(
    (counts, item) => ({
      ...counts,
      [item.status]: counts[item.status] + 1,
    }),
    {
      queued: 0,
      processing: 0,
      ready: 0,
      confirming: 0,
      confirmed: 0,
      failed: 0,
    } satisfies Record<InvoiceBatchItemStatus, number>,
  );
}

function runPreviewTask(task: QueuedPreviewTask) {
  activePreviewTasks += 1;
  task
    .run()
    .then(task.resolve, task.reject)
    .finally(() => {
      activePreviewTasks -= 1;
      drainPreviewTasks();
    });
}

function drainPreviewTasks() {
  while (
    activePreviewTasks < MAX_PARALLEL_INVOICE_PREVIEWS &&
    pendingPreviewTasks.length > 0
  ) {
    const task = pendingPreviewTasks.shift();
    if (task) {
      runPreviewTask(task);
    }
  }
}

export function enqueueInvoicePreview<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingPreviewTasks.push({
      run,
      resolve: (value) => resolve(value as T),
      reject,
    });
    drainPreviewTasks();
  });
}

export function __resetInvoicePreviewLimiterForTests() {
  activePreviewTasks = 0;
  pendingPreviewTasks.splice(0, pendingPreviewTasks.length);
  nextBatchItemIndex = 0;
}
