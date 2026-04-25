"use client";

import InvoiceImportReview from "./InvoiceImportReview";
import { useInvoiceUploadController } from "./invoice-upload-controller";
import { type InvoiceBatchItem } from "./invoice-upload-batch";
import { ImportResultCard } from "./InvoiceImportReviewShared";
import { InvoiceBatchQueue, InvoiceUploadCard } from "./InvoiceUploadQueue";

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

function ActiveInvoiceStatus({ item }: { item: InvoiceBatchItem | null }) {
  if (!item) {
    return null;
  }

  if (item.status === "confirmed" && item.result) {
    return <ImportResultCard result={item.result} />;
  }

  if (item.status === "failed") {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-4 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
        {item.error ?? "Preview failed."}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      {item.status === "queued" ? "Waiting to prepare preview." : null}
      {item.status === "processing" ? "Preparing invoice preview." : null}
      {item.status === "confirming" ? "Saving invoice to accounting." : null}
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
  const controller = useInvoiceUploadController({ canImport, companyId });
  const activeItem = controller.activeItem;

  return (
    <div className="space-y-6">
      <InvoiceUploadCard
        canImport={canImport}
        disabled={controller.batch.items.some(
          (item) => item.status === "confirming",
        )}
        providerMessage={getProviderMessage(canImport, activeProvider)}
        onFileChange={controller.handleFileChange}
      />

      <InvoiceBatchQueue
        items={controller.batch.items}
        activeItemId={controller.batch.activeItemId}
        onRetry={controller.retryItem}
        onSelect={controller.selectItem}
      />

      <div className="min-w-0">
        {controller.canShowReview && activeItem?.preview && activeItem.draft ? (
          <InvoiceImportReview
            file={activeItem.file}
            filePreviewUrl={activeItem.filePreviewUrl}
            isPreviewLightboxOpen={
              controller.batch.lightboxItemId === activeItem.id
            }
            onOpenPreviewLightbox={() => controller.setLightboxOpen(true)}
            onClosePreviewLightbox={() => controller.setLightboxOpen(false)}
            preview={activeItem.preview}
            draft={activeItem.draft}
            setDraft={controller.setActiveDraft}
            confirming={activeItem.status === "confirming"}
            submitError={activeItem.error}
            onConfirm={controller.handleConfirm}
            companyId={companyId}
          />
        ) : (
          <ActiveInvoiceStatus item={activeItem} />
        )}
      </div>
    </div>
  );
}
