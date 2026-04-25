"use client";
import { useState } from "react";
import {
  ImportedInvoiceResult,
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import InvoiceImportReview from "./InvoiceImportReview";
import { ImportResultCard } from "./InvoiceImportReviewShared";

async function previewInvoice(
  file: File,
  companyId: string,
): Promise<InvoiceImportPreviewResult> {
  const formData = new FormData();
  formData.append("invoice", file);
  formData.append("companyId", companyId);

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
  companyId: string,
): Promise<ImportedInvoiceResult> {
  const formData = new FormData();
  formData.append("invoice", file);
  formData.append("draft", JSON.stringify(draft));
  formData.append("companyId", companyId);

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

function createFilePreviewUrl(file: File): string | null {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : null;
}

function revokeFilePreviewUrl(filePreviewUrl: string | null): void {
  if (
    !filePreviewUrl ||
    typeof URL === "undefined" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return;
  }

  URL.revokeObjectURL(filePreviewUrl);
}

function getProviderMessage(
  canImport: boolean,
  activeProvider: "smartaccounts" | "merit" | null,
): string {
  return canImport
    ? `Imported invoices will be sent to ${
        activeProvider === "merit" ? "Merit" : "SmartAccounts"
      }.`
    : "Save and validate a Merit or SmartAccounts connection before importing invoices.";
}

function ImportError({ error }: { error: string }) {
  return (
    <div className="mb-6 rounded-lg border border-red-500 bg-red-500/20 px-5 py-4 text-red-500">
      {error}
    </div>
  );
}

function ImportInvoiceCard({
  canImport,
  hasSelectedFile,
  selectedFileName,
  loading,
  confirming,
  onImport,
  onFileChange,
  providerMessage,
}: {
  canImport: boolean;
  hasSelectedFile: boolean;
  selectedFileName: string | null;
  loading: boolean;
  confirming: boolean;
  onImport: () => void;
  onFileChange: (file: File | null) => void;
  providerMessage: string;
}) {
  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),_0_4px_6px_-2px_rgba(0,0,0,0.05)] sm:p-8 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="m-0 mb-4 text-lg font-semibold sm:text-xl">
        Import invoice
      </h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {providerMessage}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="invoice-file"
            className="mb-2 block text-sm text-slate-500 dark:text-slate-400"
          >
            PDF or image file
          </label>
          <label
            htmlFor="invoice-file"
            className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition hover:border-slate-400 sm:px-4 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <span className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100">
              Choose file
            </span>
            <span className="min-w-0 truncate text-sm text-slate-600 dark:text-slate-300">
              {selectedFileName ?? "No file chosen"}
            </span>
          </label>
          <input
            id="invoice-file"
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            disabled={!canImport || loading || confirming}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </div>

        <button
          className="inline-flex min-h-[56px] w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_6px_-1px_rgba(99,102,241,0.2),_0_2px_4px_-1px_rgba(99,102,241,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_10px_15px_-3px_rgba(99,102,241,0.3),_0_4px_6px_-2px_rgba(99,102,241,0.15)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          onClick={onImport}
          disabled={!hasSelectedFile || loading || confirming || !canImport}
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
  companyId = "",
}: {
  canImport: boolean;
  activeProvider: "smartaccounts" | "merit" | null;
  companyId?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<InvoiceImportPreviewResult | null>(
    null,
  );
  const [draft, setDraft] = useState<InvoiceImportDraft | null>(null);
  const [result, setResult] = useState<ImportedInvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewLightboxOpen, setPreviewLightboxOpen] = useState(false);

  async function handleImport() {
    if (!file || !canImport) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPreviewLightboxOpen(false);
    setPreview(null);
    setDraft(null);

    try {
      const importedPreview = await previewInvoice(file, companyId);
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
    setPreviewLightboxOpen(false);

    try {
      const imported = await confirmInvoice(file, draft, companyId);
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
        selectedFileName={file?.name ?? null}
        loading={loading}
        confirming={confirming}
        onImport={handleImport}
        onFileChange={(nextFile) => {
          revokeFilePreviewUrl(filePreviewUrl);

          setFile(nextFile);
          setFilePreviewUrl(nextFile ? createFilePreviewUrl(nextFile) : null);
          setPreview(null);
          setDraft(null);
          setResult(null);
          setPreviewLightboxOpen(false);
        }}
        providerMessage={providerMessage}
      />

      {error ? <ImportError error={error} /> : null}

      {preview && draft && file ? (
        <InvoiceImportReview
          file={file}
          filePreviewUrl={filePreviewUrl}
          isPreviewLightboxOpen={isPreviewLightboxOpen}
          onOpenPreviewLightbox={() => setPreviewLightboxOpen(true)}
          onClosePreviewLightbox={() => setPreviewLightboxOpen(false)}
          preview={preview}
          draft={draft}
          setDraft={setDraft}
          confirming={confirming}
          onConfirm={handleConfirm}
          companyId={companyId}
        />
      ) : null}

      {result ? <ImportResultCard result={result} /> : null}
    </div>
  );
}
