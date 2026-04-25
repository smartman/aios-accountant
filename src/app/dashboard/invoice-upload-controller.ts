import { useEffect, useRef, useState } from "react";
import type {
  ImportedInvoiceResult,
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  createInitialInvoiceUploadBatchState,
  createInvoiceBatchItem,
  enqueueInvoicePreview,
  findActiveBatchItem,
  findNextReadyItemId,
  getFilesFromInput,
  getItemErrorMessage,
  type InvoiceBatchItem,
  type InvoiceUploadBatchState,
  resolveActiveItemId,
  updateInvoiceBatchItem,
} from "./invoice-upload-batch";

type SetBatch = (
  updater: (state: InvoiceUploadBatchState) => InvoiceUploadBatchState,
) => void;

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

export function revokeFilePreviewUrl(filePreviewUrl: string | null): void {
  if (
    !filePreviewUrl ||
    typeof URL === "undefined" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return;
  }

  URL.revokeObjectURL(filePreviewUrl);
}

function updateBatchItem(
  setBatch: SetBatch,
  itemId: string,
  updater: (item: InvoiceBatchItem) => InvoiceBatchItem,
) {
  setBatch((previousState) => {
    const items = updateInvoiceBatchItem(previousState.items, itemId, updater);

    return {
      ...previousState,
      items,
      activeItemId: resolveActiveItemId(items, previousState.activeItemId),
    };
  });
}

function startPreview(params: {
  item: InvoiceBatchItem;
  companyId: string;
  setBatch: SetBatch;
}) {
  updateBatchItem(params.setBatch, params.item.id, (item) => ({
    ...item,
    status: "queued",
    error: null,
    preview: null,
    draft: null,
    result: null,
  }));

  enqueueInvoicePreview(() => {
    updateBatchItem(params.setBatch, params.item.id, (item) => ({
      ...item,
      status: "processing",
    }));
    return previewInvoice(params.item.file, params.companyId);
  })
    .then((preview) => {
      updateBatchItem(params.setBatch, params.item.id, (item) => ({
        ...item,
        status: "ready",
        preview,
        draft: preview.draft,
        error: null,
      }));
    })
    .catch((error) => {
      updateBatchItem(params.setBatch, params.item.id, (item) => ({
        ...item,
        status: "failed",
        error: getItemErrorMessage(error),
      }));
    });
}

export function useInvoiceUploadController({
  canImport,
  companyId,
}: {
  canImport: boolean;
  companyId: string;
}) {
  const [batch, setBatch] = useState(createInitialInvoiceUploadBatchState);
  const itemsRef = useRef<InvoiceBatchItem[]>([]);
  itemsRef.current = batch.items;

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        revokeFilePreviewUrl(item.filePreviewUrl);
      }
    },
    [],
  );

  function handleFileChange(selectedFiles: File[] | FileList | null) {
    const nextItems = getFilesFromInput(selectedFiles).map((file) =>
      createInvoiceBatchItem(file, createFilePreviewUrl(file)),
    );
    if (!nextItems.length || !canImport) return;

    setBatch((previousState) => {
      const items = [...previousState.items, ...nextItems];
      return {
        ...previousState,
        items,
        activeItemId: resolveActiveItemId(items, previousState.activeItemId),
      };
    });
    nextItems.forEach((item) => startPreview({ item, companyId, setBatch }));
  }

  async function handleConfirm() {
    const activeItem = findActiveBatchItem(batch.items, batch.activeItemId);
    if (!activeItem?.draft || activeItem.status !== "ready") return;

    updateBatchItem(setBatch, activeItem.id, (item) => ({
      ...item,
      status: "confirming",
    }));

    try {
      const imported = await confirmInvoice(
        activeItem.file,
        activeItem.draft,
        companyId,
      );
      revokeFilePreviewUrl(activeItem.filePreviewUrl);
      setBatch((previousState) => {
        const items = updateInvoiceBatchItem(
          previousState.items,
          activeItem.id,
          (item) => ({
            ...item,
            status: "confirmed",
            result: imported,
            filePreviewUrl: null,
            error: null,
          }),
        );

        return {
          ...previousState,
          items,
          activeItemId:
            findNextReadyItemId(items, activeItem.id) ??
            resolveActiveItemId(items, null),
          lightboxItemId: null,
        };
      });
    } catch (error) {
      updateBatchItem(setBatch, activeItem.id, (item) => ({
        ...item,
        status: "ready",
        error: getItemErrorMessage(error),
      }));
    }
  }

  const activeItem = findActiveBatchItem(batch.items, batch.activeItemId);

  return {
    activeItem,
    batch,
    canShowReview:
      (activeItem?.status === "ready" || activeItem?.status === "confirming") &&
      activeItem.preview !== null &&
      activeItem.draft !== null,
    handleConfirm,
    handleFileChange,
    retryItem: (itemId: string) => {
      const item = batch.items.find((candidate) => candidate.id === itemId);
      if (item) startPreview({ item, companyId, setBatch });
    },
    selectItem: (itemId: string) =>
      setBatch((previousState) => ({
        ...previousState,
        activeItemId: itemId,
      })),
    setActiveDraft: (draft: InvoiceImportDraft) => {
      if (!activeItem) return;
      updateBatchItem(setBatch, activeItem.id, (item) => ({
        ...item,
        draft,
      }));
    },
    setLightboxOpen: (open: boolean) => {
      if (!activeItem) return;
      setBatch((previousState) => ({
        ...previousState,
        lightboxItemId: open ? activeItem.id : null,
      }));
    },
  };
}
