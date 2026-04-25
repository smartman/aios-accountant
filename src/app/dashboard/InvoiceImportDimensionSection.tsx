import type {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  fieldClass,
  sectionTitle,
  stackedFieldLabelClass,
} from "./InvoiceImportReviewShared";

const reviewSectionClass =
  "flex flex-col gap-4 rounded-[16px] border border-slate-300/25 bg-white/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.32),_0_10px_24px_rgba(15,23,42,0.06)] sm:gap-5 sm:rounded-[18px] sm:p-[1.35rem] dark:border-slate-700/30 dark:bg-slate-900/20";
const reviewSectionCopyClass =
  "mt-[0.35rem] max-w-[42ch] text-sm leading-5 sm:leading-6 text-slate-500 dark:text-slate-400";
const reviewInlineNoteClass =
  "rounded-[14px] border border-slate-300/25 bg-white/20 p-[0.9rem_1rem] text-sm text-slate-500 dark:border-slate-600/40 dark:bg-slate-900/30 dark:text-slate-200";

export default function InvoiceImportDimensionSection({
  preview,
  draft,
  setDraft,
}: {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  const dimensions = preview.referenceData.dimensions ?? [];

  if (!dimensions.length) {
    return null;
  }

  return (
    <section className={`${reviewSectionClass} mt-6 sm:mt-8`}>
      <div>
        {sectionTitle("Dimension")}
        <p className={reviewSectionCopyClass}>
          Confirm the project, dimension, or object sent to the accounting
          system with this invoice.
        </p>
      </div>
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={stackedFieldLabelClass}>Project or object</span>
        <select
          className={fieldClass()}
          value={draft.dimension?.code ?? ""}
          onChange={(event) => {
            const selected = dimensions.find(
              (dimension) => dimension.code === event.target.value,
            );
            setDraft({
              ...draft,
              dimension: {
                code: selected?.code ?? null,
                name: selected?.name ?? null,
                reason: selected ? "Selected during import review." : null,
              },
            });
          }}
        >
          <option value="">No dimension</option>
          {dimensions.map((dimension) => (
            <option key={dimension.code} value={dimension.code}>
              {dimension.name}
            </option>
          ))}
        </select>
      </label>
      {draft.dimension?.reason ? (
        <p className={reviewInlineNoteClass}>{draft.dimension.reason}</p>
      ) : null}
    </section>
  );
}
