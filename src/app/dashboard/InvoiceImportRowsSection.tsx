import {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import { createBlankRow, sectionTitle } from "./InvoiceImportReviewShared";
import InvoiceImportRowEditor from "./InvoiceImportRowEditor";

const reviewSectionClass =
  "flex flex-col gap-5 rounded-[18px] border border-slate-300/25 bg-white/40 p-[1.35rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.32),_0_10px_24px_rgba(15,23,42,0.06)] dark:border-slate-700/30 dark:bg-slate-900/20";
const reviewSectionHeaderClass =
  "flex flex-wrap items-start justify-between gap-4";
const rowsSectionCopyClass =
  "mt-[0.35rem] text-sm leading-6 text-slate-500 dark:text-slate-400";
const rowsStackClass = "flex flex-col gap-4";

export function RowsSection({
  preview,
  draft,
  setDraft,
}: {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <section className={`${reviewSectionClass} mt-8`}>
      <div className={reviewSectionHeaderClass}>
        <div>
          {sectionTitle("Rows")}
          <p className={rowsSectionCopyClass}>
            Adjust each imported row and verify the accounting fields before
            confirm.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              rows: [...draft.rows, createBlankRow(draft)],
            })
          }
        >
          Add row
        </button>
      </div>
      <div className={rowsStackClass}>
        {draft.rows.map((row) => (
          <InvoiceImportRowEditor
            key={row.id}
            draft={draft}
            row={row}
            preview={preview}
            setDraft={setDraft}
          />
        ))}
      </div>
    </section>
  );
}
