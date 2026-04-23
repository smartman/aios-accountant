"use client";

import type {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import InvoiceImportFilePreview from "./InvoiceImportFilePreview";
import {
  InvoiceSection,
  PaymentSection,
  RowsSection,
  VendorSection,
} from "./InvoiceImportReviewSections";

export default function InvoiceImportReviewLayout({
  file,
  filePreviewUrl,
  isPreviewLightboxOpen,
  onOpenPreviewLightbox,
  onClosePreviewLightbox,
  preview,
  draft,
  setDraft,
}: {
  file: File;
  filePreviewUrl: string | null;
  isPreviewLightboxOpen: boolean;
  onOpenPreviewLightbox: () => void;
  onClosePreviewLightbox: () => void;
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.82fr)]">
      <InvoiceImportFilePreview
        file={file}
        fileUrl={filePreviewUrl}
        isLightboxOpen={isPreviewLightboxOpen}
        onOpenLightbox={onOpenPreviewLightbox}
        onCloseLightbox={onClosePreviewLightbox}
      />

      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid w-full grid-cols-1 items-start gap-6 2xl:grid-cols-2">
          <VendorSection draft={draft} setDraft={setDraft} />
          <InvoiceSection draft={draft} setDraft={setDraft} />
        </div>

        <PaymentSection preview={preview} draft={draft} setDraft={setDraft} />
        <RowsSection preview={preview} draft={draft} setDraft={setDraft} />
      </div>
    </div>
  );
}
