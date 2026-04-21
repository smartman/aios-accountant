"use client";

import {
  InvoiceImportRowEditorBody,
  RowEditorProps,
} from "./InvoiceImportRowEditorSections";

export default function InvoiceImportRowEditor(props: RowEditorProps) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-950">
      <InvoiceImportRowEditorBody {...props} />
    </div>
  );
}
