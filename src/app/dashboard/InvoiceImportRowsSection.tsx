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
const rowsStackClass = "flex flex-col gap-4";
const rowActionButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700";
const secondaryRowActionButtonClass = `${rowActionButtonClass} bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700`;
const primaryRowActionButtonClass = `${rowActionButtonClass} bg-white text-slate-900 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800`;

function acceptAllRows(draft: InvoiceImportDraft): InvoiceImportDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => ({ ...row, reviewed: true })),
  };
}

export function RowsSection({
  preview,
  draft,
  setDraft,
}: {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  const hasUnreviewedRows = draft.rows.some((row) => !row.reviewed);

  return (
    <section className={`${reviewSectionClass} mt-8`}>
      <div className={reviewSectionHeaderClass}>
        <div>{sectionTitle("Invoice rows")}</div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={primaryRowActionButtonClass}
            type="button"
            disabled={!hasUnreviewedRows}
            onClick={() => setDraft(acceptAllRows(draft))}
          >
            Accept all line items
          </button>
          <button
            className={secondaryRowActionButtonClass}
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
