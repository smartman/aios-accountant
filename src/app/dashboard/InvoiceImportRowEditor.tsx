"use client";

import {
  InvoiceImportRowEditorBody,
  RowEditorProps,
} from "./InvoiceImportRowEditorSections";

function rowEditorCardClass({ row }: RowEditorProps): string {
  const base =
    "rounded-[18px] border p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]";

  if (row.needsManualReview && !row.reviewed) {
    return `${base} border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/30`;
  }

  return `${base} border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950`;
}

export default function InvoiceImportRowEditor(props: RowEditorProps) {
  return (
    <div className={rowEditorCardClass(props)}>
      <InvoiceImportRowEditorBody {...props} />
    </div>
  );
}
