"use client";

import type { CSSProperties } from "react";
import {
  ImportedInvoiceResult,
  InvoiceImportDraft,
  InvoiceImportDraftRow,
} from "@/lib/invoice-import-types";

export function formatCurrency(
  value: number | null | undefined,
  currency = "EUR",
): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value,
  );
}

export function fieldStyle(): CSSProperties {
  return {
    width: "100%",
    minHeight: "48px",
    padding: "0.75rem 1rem",
    borderRadius: "12px",
    border: "1px solid var(--field-border)",
    backgroundColor: "var(--field-background)",
    color: "var(--foreground)",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    lineHeight: 1.35,
  } as const;
}

export function fieldClass(extraClass = "") {
  const base =
    "w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-[0.95rem] leading-[1.35] text-slate-900 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
  return `${base} ${extraClass}`.trim();
}

export const stackedFieldLabelClass =
  "text-sm leading-5 text-slate-600 whitespace-normal text-pretty dark:text-slate-300";

export const compactFieldLabelClass =
  "text-sm leading-5 text-slate-600 whitespace-normal text-pretty dark:text-slate-400";

export function sectionTitle(title: string) {
  return <h3 className="m-0 text-base font-bold tracking-tight">{title}</h3>;
}

export function statusChipClass(status = "") {
  const base =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium";
  if (status === "success" || status === "clear") {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (status === "warning" || status === "ambiguous") {
    return `${base} border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  if (status === "missing") {
    return `${base} border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200`;
  }

  return `${base} border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200`;
}

export function updateRow(
  draft: InvoiceImportDraft,
  rowId: string,
  updater: (row: InvoiceImportDraftRow) => InvoiceImportDraftRow,
): InvoiceImportDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => (row.id === rowId ? updater(row) : row)),
  };
}

function nextDraftRowIndex(rows: InvoiceImportDraftRow[]): number {
  const maxExistingIndex = rows.reduce((maxIndex, row) => {
    const match = row.id.match(/^row-(\d+)$/);
    if (!match) {
      return maxIndex;
    }

    return Math.max(maxIndex, Number(match[1]));
  }, 0);

  return maxExistingIndex + 1;
}

export function createBlankRow(
  draft: InvoiceImportDraft,
): InvoiceImportDraftRow {
  const nextIndex = nextDraftRowIndex(draft.rows);
  return {
    id: `row-${nextIndex}`,
    sourceArticleCode: null,
    description: "",
    quantity: 1,
    unit: null,
    price: null,
    sum: null,
    vatRate: null,
    taxCode: null,
    accountCode: draft.rows[0]?.accountCode ?? "",
    accountSelectionReason: "Added manually during review.",
    articleDecision: "existing",
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
    newArticle: {
      code: "",
      description: "",
      unit: "",
      type: "SERVICE",
      purchaseAccountCode: draft.rows[0]?.accountCode ?? "",
      taxCode: null,
    },
  };
}

function ImportStatusBadges({ result }: { result: ImportedInvoiceResult }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={statusChipClass()}>
        {result.provider === "merit" ? "Merit" : "SmartAccounts"}
      </span>
      {result.alreadyExisted ? (
        <span className={statusChipClass("warning")}>Already existed</span>
      ) : null}
      {result.createdVendor ? (
        <span className={statusChipClass("success")}>New vendor created</span>
      ) : null}
      {result.createdPayment ? (
        <span className={statusChipClass("success")}>Payment recorded</span>
      ) : null}
    </div>
  );
}

export function ImportResultCard({
  result,
}: {
  result: ImportedInvoiceResult;
}) {
  const currency = result.extraction.invoice.currency ?? "EUR";

  return (
    <div className="animate-fade-in rounded-xl border border-slate-200 bg-slate-100 p-8 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),_0_4px_6px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <h3 className="m-0 text-lg font-bold">Invoice imported</h3>
        <ImportStatusBadges result={result} />
      </div>

      <div className="grid w-full gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,_1fr))]">
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Invoice
          </p>
          <p className="mt-[0.35rem] font-semibold">
            {result.invoiceNumber ?? result.invoiceId}
          </p>
        </div>
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Vendor
          </p>
          <p className="mt-[0.35rem] font-semibold">{result.vendorName}</p>
        </div>
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Net total
          </p>
          <p className="mt-[0.35rem] font-semibold">
            {formatCurrency(
              result.extraction.invoice.amountExcludingVat,
              currency,
            )}
          </p>
        </div>
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Gross total
          </p>
          <p className="mt-[0.35rem] font-semibold">
            {formatCurrency(result.extraction.invoice.totalAmount, currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
