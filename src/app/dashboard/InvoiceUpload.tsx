"use client";
import { useState } from "react";
import { ImportedInvoiceResult } from "@/lib/invoice-import-types";

function formatCurrency(
  value: number | null | undefined,
  currency = "EUR",
): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value,
  );
}

function renderBadge(text: string, tone: "neutral" | "success" | "warning") {
  const background =
    tone === "success"
      ? "var(--success-bg)"
      : tone === "warning"
        ? "var(--warning-bg)"
        : "rgba(255,255,255,0.08)";
  const border =
    tone === "success"
      ? "1px solid var(--success)"
      : tone === "warning"
        ? "1px solid var(--warning)"
        : "1px solid var(--border)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 0.75rem",
        borderRadius: "999px",
        background,
        border,
        fontSize: "0.875rem",
      }}
    >
      {text}
    </span>
  );
}

function ImportStatusBadges({ result }: { result: ImportedInvoiceResult }) {
  return (
    <>
      {result.provider &&
        renderBadge(
          result.provider === "merit" ? "Merit" : "SmartAccounts",
          "neutral",
        )}
      {result.alreadyExisted && renderBadge("Already existed", "warning")}
      {result.createdVendor && renderBadge("New vendor created", "success")}
      {result.createdPayment && renderBadge("Payment recorded", "success")}
    </>
  );
}

function ImportSummary({ result }: { result: ImportedInvoiceResult }) {
  const currency = result.extraction.invoice.currency ?? "EUR";

  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "max-content 1fr",
        gap: "0.5rem 1.5rem",
        fontSize: "0.9rem",
      }}
    >
      <dt style={{ color: "var(--text-muted)" }}>Invoice ID</dt>
      <dd style={{ fontFamily: "monospace" }}>{result.invoiceId}</dd>

      <dt style={{ color: "var(--text-muted)" }}>Invoice number</dt>
      <dd>{result.invoiceNumber ?? "N/A"}</dd>

      <dt style={{ color: "var(--text-muted)" }}>Vendor</dt>
      <dd>{result.vendorName}</dd>

      <dt style={{ color: "var(--text-muted)" }}>Currency</dt>
      <dd>{currency}</dd>

      <dt style={{ color: "var(--text-muted)" }}>Amount excl. VAT</dt>
      <dd>
        {formatCurrency(result.extraction.invoice.amountExcludingVat, currency)}
      </dd>

      <dt style={{ color: "var(--text-muted)" }}>VAT amount</dt>
      <dd>{formatCurrency(result.extraction.invoice.vatAmount, currency)}</dd>

      <dt style={{ color: "var(--text-muted)" }}>Total amount</dt>
      <dd style={{ fontWeight: 700 }}>
        {formatCurrency(result.extraction.invoice.totalAmount, currency)}
      </dd>

      {result.paymentAccount ? (
        <>
          <dt style={{ color: "var(--text-muted)" }}>Payment account</dt>
          <dd>
            {result.paymentAccount.type} - {result.paymentAccount.name}
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function PurchaseAccounts({ result }: { result: ImportedInvoiceResult }) {
  if (!result.purchaseAccounts.length) {
    return null;
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h4
        style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        Purchase accounts
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {result.purchaseAccounts.map((acc) => (
          <div
            key={acc.code}
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              fontSize: "0.875rem",
            }}
          >
            <span style={{ fontWeight: 600 }}>{acc.code}</span>
            {acc.label ? (
              <span
                style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}
              >
                {acc.label}
              </span>
            ) : null}
            {acc.reason ? (
              <p
                style={{
                  margin: "0.25rem 0 0",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                }}
              >
                {acc.reason}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) {
    return null;
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h4
        style={{
          fontSize: "0.9rem",
          fontWeight: 600,
          marginBottom: "0.75rem",
          color: "var(--warning)",
        }}
      >
        Warnings
      </h4>
      <ul
        style={{
          paddingLeft: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
        }}
      >
        {warnings.map((warning) => (
          <li
            key={warning}
            style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}
          >
            {warning}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportResultCard({ result }: { result: ImportedInvoiceResult }) {
  return (
    <div className="glass-card animate-fade-in" style={{ padding: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
          Invoice imported
        </h3>
        <ImportStatusBadges result={result} />
      </div>

      <ImportSummary result={result} />
      <PurchaseAccounts result={result} />
      <ImportWarnings warnings={result.extraction.warnings} />
    </div>
  );
}

async function importInvoice(file: File): Promise<ImportedInvoiceResult> {
  const formData = new FormData();
  formData.append("invoice", file);

  const response = await fetch("/api/import-invoice", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Import failed.");
  }

  return data as ImportedInvoiceResult;
}

function getProviderMessage(
  canImport: boolean,
  activeProvider: "smartaccounts" | "merit" | null,
): string {
  return canImport
    ? `Imported invoices will be sent to ${activeProvider === "merit" ? "Merit" : "SmartAccounts"}.`
    : "Save and validate a Merit or SmartAccounts connection before importing invoices.";
}

export default function InvoiceUpload({
  canImport,
  activeProvider,
}: {
  canImport: boolean;
  activeProvider: "smartaccounts" | "merit" | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportedInvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!file || !canImport) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const imported = await importInvoice(file);
      setResult(imported);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Network error — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const providerMessage = getProviderMessage(canImport, activeProvider);

  return (
    <div>
      <div
        className="glass-card"
        style={{ padding: "2rem", marginBottom: "2rem" }}
      >
        <h2
          style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}
        >
          Import invoice
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            marginTop: 0,
            marginBottom: "1rem",
          }}
        >
          {providerMessage}
        </p>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "220px" }}>
            <label
              htmlFor="invoice-file"
              style={{
                display: "block",
                fontSize: "0.875rem",
                marginBottom: "0.5rem",
                color: "var(--text-muted)",
              }}
            >
              PDF or image file
            </label>
            <input
              id="invoice-file"
              type="file"
              accept="application/pdf,image/*"
              className="input-field"
              disabled={!canImport || loading}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!file || loading || !canImport}
            style={{ whiteSpace: "nowrap" }}
          >
            {loading ? "Importing…" : "Import invoice"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "12px",
            background: "var(--error-bg)",
            border: "1px solid var(--error)",
            color: "var(--error)",
            marginBottom: "1.5rem",
          }}
        >
          {error}
        </div>
      )}

      {result ? <ImportResultCard result={result} /> : null}
    </div>
  );
}
