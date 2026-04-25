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
  type InvoicePreviewPromise,
  type InvoiceUploadBatchState,
  resolveActiveItemId,
  updateInvoiceBatchItem,
} from "./invoice-upload-batch";

type SetBatch = (
  updater: (state: InvoiceUploadBatchState) => InvoiceUploadBatchState,
) => void;

type Ref<T> = { current: T };

async function previewInvoice(
  file: File,
  companyId: string,
  signal: AbortSignal,
): Promise<InvoiceImportPreviewResult> {
  const formData = new FormData();
  formData.append("invoice", file);
  formData.append("companyId", companyId);

  const response = await fetch("/api/import-invoice", {
    method: "POST",
    body: formData,
    signal,
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
  isCanceled: () => boolean;
  signal: AbortSignal;
  setBatch: SetBatch;
}): InvoicePreviewPromise<InvoiceImportPreviewResult> {
  updateBatchItem(params.setBatch, params.item.id, (item) => ({
    ...item,
    status: "queued",
    error: null,
    preview: null,
    draft: null,
    result: null,
  }));

  const previewPromise = enqueueInvoicePreview(() => {
    if (params.isCanceled()) {
      throw new Error("Invoice preview canceled.");
    }

    updateBatchItem(params.setBatch, params.item.id, (item) => ({
      ...item,
      status: "processing",
    }));
    return previewInvoice(params.item.file, params.companyId, params.signal);
  });

  previewPromise
    .then((preview) => {
      if (params.isCanceled()) return;
      updateBatchItem(params.setBatch, params.item.id, (item) => ({
        ...item,
        status: "ready",
        preview,
        draft: preview.draft,
        error: null,
      }));
    })
    .catch((error) => {
      if (params.isCanceled()) return;
      updateBatchItem(params.setBatch, params.item.id, (item) => ({
        ...item,
        status: "failed",
        error: getItemErrorMessage(error),
      }));
    });

  return previewPromise;
}

function startManagedPreview(params: {
  companyId: string;
  item: InvoiceBatchItem;
  mountedRef: Ref<boolean>;
  previewCancelersRef: Ref<Map<string, () => void>>;
  setBatch: SetBatch;
}) {
  const abortController = new AbortController();
  const isCanceled = () =>
    !params.mountedRef.current || abortController.signal.aborted;
  const previewPromise = startPreview({
    item: params.item,
    companyId: params.companyId,
    isCanceled,
    signal: abortController.signal,
    setBatch: params.setBatch,
  });

  params.previewCancelersRef.current.set(params.item.id, () => {
    abortController.abort();
    previewPromise.cancel();
  });
  previewPromise.then(
    () => params.previewCancelersRef.current.delete(params.item.id),
    () => params.previewCancelersRef.current.delete(params.item.id),
  );
}

async function confirmActiveInvoice(params: {
  batch: InvoiceUploadBatchState;
  companyId: string;
  setBatch: SetBatch;
}) {
  const activeItem = findActiveBatchItem(
    params.batch.items,
    params.batch.activeItemId,
  );
  if (!activeItem?.draft || activeItem.status !== "ready") return;

  updateBatchItem(params.setBatch, activeItem.id, (item) => ({
    ...item,
    status: "confirming",
  }));

  try {
    const imported = await confirmInvoice(
      activeItem.file,
      activeItem.draft,
      params.companyId,
    );
    revokeFilePreviewUrl(activeItem.filePreviewUrl);
    params.setBatch((previousState) => {
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
    updateBatchItem(params.setBatch, activeItem.id, (item) => ({
      ...item,
      status: "ready",
      error: getItemErrorMessage(error),
    }));
  }
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
  const mountedRef = useRef(true);
  const previewCancelersRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    itemsRef.current = batch.items;
  }, [batch.items]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      for (const cancelPreview of previewCancelersRef.current.values()) {
        cancelPreview();
      }
      previewCancelersRef.current.clear();
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
    nextItems.forEach((item) =>
      startManagedPreview({
        item,
        companyId,
        mountedRef,
        previewCancelersRef,
        setBatch,
      }),
    );
  }

  async function handleConfirm() {
    await confirmActiveInvoice({ batch, companyId, setBatch });
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
      if (item) {
        startManagedPreview({
          item,
          companyId,
          mountedRef,
          previewCancelersRef,
          setBatch,
        });
      }
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
