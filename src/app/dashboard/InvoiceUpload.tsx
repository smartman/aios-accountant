"use client";
import { useState } from "react";
import {
  ImportedInvoiceResult,
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import InvoiceImportReview from "./InvoiceImportReview";
import { ImportResultCard } from "./InvoiceImportReviewShared";

async function previewInvoice(file: File): Promise<InvoiceImportPreviewResult> {
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

  return data as InvoiceImportPreviewResult;
}

async function confirmInvoice(
  file: File,
  draft: InvoiceImportDraft,
): Promise<ImportedInvoiceResult> {
  const formData = new FormData();
  formData.append("invoice", file);
  formData.append("draft", JSON.stringify(draft));

  const response = await fetch("/api/import-invoice/confirm", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Import confirm failed.");
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

function ImportError({ error }: { error: string }) {
  return (
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
  );
}

function ImportInvoiceCard({
  canImport,
  hasSelectedFile,
  loading,
  confirming,
  onImport,
  onFileChange,
  onRequestProviderChange,
  providerMessage,
}: {
  canImport: boolean;
  hasSelectedFile: boolean;
  loading: boolean;
  confirming: boolean;
  onImport: () => void;
  onFileChange: (file: File | null) => void;
  onRequestProviderChange?: () => void;
  providerMessage: string;
}) {
  return (
    <div
      className="glass-card"
      style={{ padding: "2rem", marginBottom: "2rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
          Import invoice
        </h2>

        {onRequestProviderChange ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRequestProviderChange}
          >
            Change accounting provider
          </button>
        ) : null}
      </div>
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
            disabled={!canImport || loading || confirming}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={onImport}
          disabled={!hasSelectedFile || loading || confirming || !canImport}
          style={{ whiteSpace: "nowrap" }}
        >
          {loading ? "Preparing review…" : "Import invoice"}
        </button>
      </div>
    </div>
  );
}

export default function InvoiceUpload({
  canImport,
  activeProvider,
  onRequestProviderChange,
}: {
  canImport: boolean;
  activeProvider: "smartaccounts" | "merit" | null;
  onRequestProviderChange?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<InvoiceImportPreviewResult | null>(
    null,
  );
  const [draft, setDraft] = useState<InvoiceImportDraft | null>(null);
  const [result, setResult] = useState<ImportedInvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!file || !canImport) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPreview(null);
    setDraft(null);

    try {
      const importedPreview = await previewInvoice(file);
      setPreview(importedPreview);
      setDraft(importedPreview.draft);
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

  async function handleConfirm() {
    if (!file || !draft) return;
    setConfirming(true);
    setError(null);

    try {
      const imported = await confirmInvoice(file, draft);
      setResult(imported);
      setPreview(null);
      setDraft(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Network error — please try again.",
      );
    } finally {
      setConfirming(false);
    }
  }

  const providerMessage = getProviderMessage(canImport, activeProvider);

  return (
    <div>
      <ImportInvoiceCard
        canImport={canImport}
        hasSelectedFile={file !== null}
        loading={loading}
        confirming={confirming}
        onImport={handleImport}
        onFileChange={(nextFile) => {
          setFile(nextFile);
          setPreview(null);
          setDraft(null);
          setResult(null);
        }}
        onRequestProviderChange={onRequestProviderChange}
        providerMessage={providerMessage}
      />

      {error ? <ImportError error={error} /> : null}

      {preview && draft ? (
        <InvoiceImportReview
          preview={preview}
          draft={draft}
          setDraft={setDraft}
          confirming={confirming}
          onConfirm={handleConfirm}
        />
      ) : null}

      {result ? <ImportResultCard result={result} /> : null}
    </div>
  );
}
