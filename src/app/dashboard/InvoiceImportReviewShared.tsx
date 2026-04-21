"use client";

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

export function fieldStyle() {
  return {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.95rem",
  } as const;
}

export function sectionTitle(title: string) {
  return (
    <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700 }}>
      {title}
    </h3>
  );
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
    unit: "pcs",
    price: null,
    sum: null,
    vatRate: null,
    taxCode: null,
    accountCode: draft.rows[0]?.accountCode ?? "",
    accountSelectionReason: "Added manually during review.",
    articleDecision: "create",
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
    newArticle: {
      code: `NEW_${nextIndex}`,
      description: "",
      unit: "pcs",
      type: "SERVICE",
      purchaseAccountCode: draft.rows[0]?.accountCode ?? "",
      taxCode: null,
    },
  };
}

function ImportStatusBadges({ result }: { result: ImportedInvoiceResult }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <span className="status-chip">
        {result.provider === "merit" ? "Merit" : "SmartAccounts"}
      </span>
      {result.alreadyExisted ? (
        <span className="status-chip warning">Already existed</span>
      ) : null}
      {result.createdVendor ? (
        <span className="status-chip success">New vendor created</span>
      ) : null}
      {result.createdPayment ? (
        <span className="status-chip success">Payment recorded</span>
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
    <div className="glass-card animate-fade-in" style={{ padding: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
          Invoice imported
        </h3>
        <ImportStatusBadges result={result} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            Invoice
          </p>
          <p style={{ margin: "0.35rem 0 0", fontWeight: 600 }}>
            {result.invoiceNumber ?? result.invoiceId}
          </p>
        </div>
        <div>
          <p
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            Vendor
          </p>
          <p style={{ margin: "0.35rem 0 0", fontWeight: 600 }}>
            {result.vendorName}
          </p>
        </div>
        <div>
          <p
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            Net total
          </p>
          <p style={{ margin: "0.35rem 0 0", fontWeight: 600 }}>
            {formatCurrency(
              result.extraction.invoice.amountExcludingVat,
              currency,
            )}
          </p>
        </div>
        <div>
          <p
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            Gross total
          </p>
          <p style={{ margin: "0.35rem 0 0", fontWeight: 600 }}>
            {formatCurrency(result.extraction.invoice.totalAmount, currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
