"use client";

import { clearAccountingConnectionCacheFromForm } from "./actions";
import {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import { validateDraft } from "@/lib/invoice-import/draft-validation";
import { buildDuplicateConfirmationMessage } from "./InvoiceImportDuplicatePrompt";
import InvoiceImportReviewLayout from "./InvoiceImportReviewLayout";

interface ReviewProps {
  file: File;
  filePreviewUrl: string | null;
  isPreviewLightboxOpen: boolean;
  onOpenPreviewLightbox: () => void;
  onClosePreviewLightbox: () => void;
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
  confirming: boolean;
  onConfirm: () => void;
}

const summaryChipClass =
  "rounded-lg border border-slate-300 p-3 text-sm dark:border-slate-700";

function ReviewHeader({ draft }: { draft: InvoiceImportDraft }) {
  return (
    <div className="mb-6 flex flex-wrap justify-between gap-4">
      <div>
        <h2 className="m-0 text-2xl font-bold">Review before import</h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Edit the invoice, payment, and row details you need before confirming
          the import.
        </p>
      </div>

      <div className="min-w-[220px] space-y-2">
        {draft.duplicateInvoice ? (
          <div
            className={`${summaryChipClass} border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200`}
          >
            Possible duplicate: {draft.duplicateInvoice.vendorName} —
            {draft.duplicateInvoice.invoiceNumber}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WarningPanel({ warnings }: { warnings: string[] }) {
  if (!warnings.length) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-col gap-2 rounded-xl border border-amber-400 bg-amber-100/60 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/40">
      {warnings.map((warning) => (
        <p key={warning} className="m-0">
          {warning}
        </p>
      ))}
    </div>
  );
}

function MissingArticleWarningPanel({ draft }: { draft: InvoiceImportDraft }) {
  const hasUnresolvedMissingArticle = draft.rows.some(
    (row) => row.suggestionStatus === "missing" && !row.selectedArticleCode,
  );

  if (!hasUnresolvedMissingArticle) {
    return null;
  }

  return (
    <form
      action={clearAccountingConnectionCacheFromForm}
      className="mb-6 rounded-xl border border-amber-400 bg-amber-100/60 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <p className="m-0 text-sm font-medium text-amber-900 dark:text-amber-100">
        Article not detected, choose manually or create new article and refresh
        the article cache.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg border border-amber-500 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/40"
        >
          Clear article cache
        </button>
      </div>
    </form>
  );
}

function ErrorPanel({ errors }: { errors: string[] }) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-col gap-2 rounded-xl border border-rose-400 bg-rose-100/60 px-5 py-4 dark:border-rose-800 dark:bg-rose-950/40">
      {errors.map((error) => (
        <p key={error} className="m-0">
          {error}
        </p>
      ))}
    </div>
  );
}

function ConfirmButton({
  draft,
  confirming,
  disabled,
  onConfirm,
}: Pick<ReviewProps, "draft" | "confirming" | "onConfirm"> & {
  disabled: boolean;
}) {
  return (
    <div className="mt-8 flex justify-end">
      <button
        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_6px_-1px_rgba(99,102,241,0.2),_0_2px_4px_-1px_rgba(99,102,241,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_10px_15px_-3px_rgba(99,102,241,0.3),_0_4px_6px_-2px_rgba(99,102,241,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={disabled}
        onClick={() => {
          const duplicateMessage = buildDuplicateConfirmationMessage(draft);
          if (
            duplicateMessage &&
            typeof window !== "undefined" &&
            !window.confirm(duplicateMessage)
          ) {
            return;
          }

          onConfirm();
        }}
      >
        {confirming ? "Creating invoice…" : "Confirm and create invoice"}
      </button>
    </div>
  );
}

export default function InvoiceImportReview({
  file,
  filePreviewUrl,
  isPreviewLightboxOpen,
  onOpenPreviewLightbox,
  onClosePreviewLightbox,
  preview,
  draft,
  setDraft,
  confirming,
  onConfirm,
}: ReviewProps) {
  const errors = validateDraft(draft);

  return (
    <div className="animate-fade-in rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.92))] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.94))] sm:p-8">
      <ReviewHeader draft={draft} />
      <WarningPanel warnings={draft.warnings} />
      <MissingArticleWarningPanel draft={draft} />
      <InvoiceImportReviewLayout
        file={file}
        filePreviewUrl={filePreviewUrl}
        isPreviewLightboxOpen={isPreviewLightboxOpen}
        onOpenPreviewLightbox={onOpenPreviewLightbox}
        onClosePreviewLightbox={onClosePreviewLightbox}
        preview={preview}
        draft={draft}
        setDraft={setDraft}
      />
      <ErrorPanel errors={errors} />
      <ConfirmButton
        draft={draft}
        confirming={confirming}
        disabled={confirming || errors.length > 0}
        onConfirm={onConfirm}
      />
    </div>
  );
}
