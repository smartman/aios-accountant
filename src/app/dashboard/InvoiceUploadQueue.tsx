"use client";

import type { InvoiceBatchItem } from "./invoice-upload-batch";
import {
  countBatchItemsByStatus,
  MAX_PARALLEL_INVOICE_PREVIEWS,
} from "./invoice-upload-batch";
import { statusChipClass } from "./InvoiceImportReviewShared";

function statusLabel(item: InvoiceBatchItem): string {
  if (item.status === "ready") return "Ready";
  if (item.status === "processing") return "Preparing";
  if (item.status === "queued") return "Queued";
  if (item.status === "confirming") return "Saving";
  if (item.status === "confirmed") return "Imported";
  return "Failed";
}

function statusTone(item: InvoiceBatchItem): string {
  if (item.status === "ready" || item.status === "confirmed") {
    return "success";
  }

  if (item.status === "failed") {
    return "missing";
  }

  if (item.status === "processing" || item.status === "confirming") {
    return "warning";
  }

  return "";
}

export function InvoiceUploadCard({
  canImport,
  disabled,
  providerMessage,
  onFileChange,
}: {
  canImport: boolean;
  disabled: boolean;
  providerMessage: string;
  onFileChange: (files: File[]) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),_0_4px_6px_-2px_rgba(0,0,0,0.05)] sm:p-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 text-lg font-semibold sm:text-xl">
            Import invoices
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {providerMessage}
          </p>
        </div>
        <span className={statusChipClass()}>
          Max {MAX_PARALLEL_INVOICE_PREVIEWS} previews at once
        </span>
      </div>

      <div className="mt-5">
        <label
          htmlFor="invoice-files"
          className="mb-2 block text-sm text-slate-500 dark:text-slate-400"
        >
          PDF or image files
        </label>
        <label
          htmlFor="invoice-files"
          className="flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm transition hover:border-slate-400 sm:px-4 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
        >
          <span className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100">
            Choose files
          </span>
          <span className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
            Selected invoices start preparing automatically
          </span>
        </label>
        <input
          id="invoice-files"
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="sr-only"
          disabled={!canImport || disabled}
          onChange={(event) => {
            onFileChange(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}

function QueueSummary({ items }: { items: InvoiceBatchItem[] }) {
  const counts = countBatchItemsByStatus(items);
  const pendingCount = counts.queued + counts.processing + counts.confirming;

  return (
    <div className="grid min-w-[260px] grid-cols-3 gap-3 text-sm sm:min-w-[320px]">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Pending
        </p>
        <p className="mt-1 text-lg font-semibold">{pendingCount}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Ready
        </p>
        <p className="mt-1 text-lg font-semibold">{counts.ready}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Imported
        </p>
        <p className="mt-1 text-lg font-semibold">{counts.confirmed}</p>
      </div>
    </div>
  );
}

function QueueItem({
  item,
  active,
  onRetry,
  onSelect,
}: {
  item: InvoiceBatchItem;
  active: boolean;
  onRetry: (itemId: string) => void;
  onSelect: (itemId: string) => void;
}) {
  return (
    <li className="w-[min(72vw,280px)] shrink-0">
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={`min-h-[76px] w-full rounded-xl border px-3 py-3 text-left transition ${
          active
            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/30"
            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
        }`}
      >
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {item.file.name}
            </span>
            {item.error ? (
              <span className="mt-1 block text-sm text-rose-600 dark:text-rose-300">
                {item.error}
              </span>
            ) : null}
          </span>
          <span className={statusChipClass(statusTone(item))}>
            {statusLabel(item)}
          </span>
        </span>
      </button>

      {item.status === "failed" ? (
        <button
          type="button"
          onClick={() => onRetry(item.id)}
          className="mt-2 inline-flex min-h-[38px] w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Retry {item.file.name}
        </button>
      ) : null}
    </li>
  );
}

export function InvoiceBatchQueue({
  items,
  activeItemId,
  onRetry,
  onSelect,
}: {
  items: InvoiceBatchItem[];
  activeItemId: string | null;
  onRetry: (itemId: string) => void;
  onSelect: (itemId: string) => void;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <aside className="rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08),_0_4px_6px_-2px_rgba(0,0,0,0.04)] dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="m-0 text-base font-semibold">Invoice queue</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ready invoices stay here until confirmed.
          </p>
        </div>
        <QueueSummary items={items} />
      </div>
      <ol className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <QueueItem
            key={item.id}
            item={item}
            active={item.id === activeItemId}
            onRetry={onRetry}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </aside>
  );
}
