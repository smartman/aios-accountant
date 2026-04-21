"use client";

import {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  computeDraftNetTotal,
  validateDraft,
} from "@/lib/invoice-import/draft-validation";
import { formatCurrency } from "./InvoiceImportReviewShared";
import {
  InvoiceSection,
  PaymentSection,
  RowsSection,
  VendorSection,
} from "./InvoiceImportReviewSections";

interface ReviewProps {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
  confirming: boolean;
  onConfirm: () => void;
}

function ReviewHeader({
  draft,
  rowNet,
  currency,
}: {
  draft: InvoiceImportDraft;
  rowNet: number;
  currency: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
        marginBottom: "1.5rem",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
          Review before import
        </h2>
        <p style={{ margin: "0.5rem 0 0", color: "var(--text-muted)" }}>
          Edit every field you need, review each row, then confirm the final
          accounting article or item choice.
        </p>
      </div>

      <div style={{ minWidth: "220px" }}>
        <div className="summary-chip">
          Row net total: {formatCurrency(rowNet, currency)}
        </div>
        <div className="summary-chip">
          Header net total:{" "}
          {formatCurrency(draft.invoice.amountExcludingVat, currency)}
        </div>
        {draft.duplicateInvoiceId ? (
          <div className="summary-chip warning">
            Possible duplicate: {draft.duplicateInvoiceId}
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
    <div className="warning-panel">
      {warnings.map((warning) => (
        <p key={warning} style={{ margin: 0 }}>
          {warning}
        </p>
      ))}
    </div>
  );
}

function ErrorPanel({ errors }: { errors: string[] }) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className="error-panel">
      {errors.map((error) => (
        <p key={error} style={{ margin: 0 }}>
          {error}
        </p>
      ))}
    </div>
  );
}

function ConfirmButton({
  confirming,
  disabled,
  onConfirm,
}: Pick<ReviewProps, "confirming" | "onConfirm"> & { disabled: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginTop: "2rem",
      }}
    >
      <button
        className="btn btn-primary"
        type="button"
        disabled={disabled}
        onClick={onConfirm}
      >
        {confirming ? "Creating invoice…" : "Confirm and create invoice"}
      </button>
    </div>
  );
}

export default function InvoiceImportReview({
  preview,
  draft,
  setDraft,
  confirming,
  onConfirm,
}: ReviewProps) {
  const errors = validateDraft(draft);
  const rowNet = computeDraftNetTotal(draft.rows);
  const currency = draft.invoice.currency || "EUR";

  return (
    <div className="glass-card animate-fade-in" style={{ padding: "2rem" }}>
      <ReviewHeader draft={draft} rowNet={rowNet} currency={currency} />
      <WarningPanel warnings={draft.warnings} />

      <div className="review-grid">
        <VendorSection draft={draft} setDraft={setDraft} />
        <InvoiceSection draft={draft} setDraft={setDraft} />
      </div>

      <PaymentSection preview={preview} draft={draft} setDraft={setDraft} />
      <RowsSection preview={preview} draft={draft} setDraft={setDraft} />
      <ErrorPanel errors={errors} />
      <ConfirmButton
        confirming={confirming}
        disabled={confirming || errors.length > 0}
        onConfirm={onConfirm}
      />
    </div>
  );
}
