import {
  AccountingProviderActivities,
  ProviderCreateVendorResult,
} from "../accounting-provider-activities";
import { ProviderResolvedRow } from "../accounting-provider-types";
import {
  ImportedInvoiceResult,
  InvoiceExtraction,
  InvoiceImportDraft,
} from "../invoice-import-types";
import { uniqueAccounts } from "../provider-import-helpers";
import { StoredAccountingConnection } from "../user-accounting-connections";
import { validateDraft } from "./draft-validation";
import {
  logInvoiceImportEvent,
  measureInvoiceImportPhase,
} from "./observability";
import { formatInvoiceImportRowLabel } from "./row-label";
import {
  assertReferenceAccounts,
  attachFileIfNeeded,
  buildExistingResult,
  recordPaymentIfNeeded,
} from "./workflow-utils";

interface ResolvedVendorForConfirm extends ProviderCreateVendorResult {
  createdVendor: boolean;
}

interface ConfirmWorkflowParams<TCredentials> {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  mimeType: string;
  filename: string;
  buffer: Buffer;
  draft: InvoiceImportDraft;
}

function extractionFromDraft(draft: InvoiceImportDraft): InvoiceExtraction {
  return {
    vendor: {
      name: draft.vendor.name,
      regCode: draft.vendor.regCode,
      vatNumber: draft.vendor.vatNumber,
      bankAccount: draft.vendor.bankAccount,
      email: draft.vendor.email,
      phone: draft.vendor.phone,
      countryCode: draft.vendor.countryCode,
      city: draft.vendor.city,
      postalCode: draft.vendor.postalCode,
      addressLine1: draft.vendor.addressLine1,
      addressLine2: draft.vendor.addressLine2,
    },
    invoice: {
      documentType: draft.invoice.documentType,
      invoiceNumber: draft.invoice.invoiceNumber,
      referenceNumber: draft.invoice.referenceNumber,
      currency: draft.invoice.currency,
      issueDate: draft.invoice.issueDate,
      dueDate: draft.invoice.dueDate,
      entryDate: draft.invoice.entryDate,
      amountExcludingVat: draft.invoice.amountExcludingVat,
      vatAmount: draft.invoice.vatAmount,
      totalAmount: draft.invoice.totalAmount,
      notes: draft.invoice.notes,
    },
    payment: {
      isPaid: draft.actions.recordPayment,
      paymentDate: draft.payment.paymentDate,
      paymentAmount: draft.payment.paymentAmount,
      paymentChannelHint: draft.payment.paymentChannelHint,
      reason: draft.payment.reason,
      paymentAccountName: draft.payment.paymentAccountName,
    },
    rows: draft.rows.map((row) => ({
      sourceArticleCode: row.sourceArticleCode,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      price: row.price,
      sum: row.sum,
      vatRate: row.vatRate,
      vatPc: row.taxCode,
      accountPurchase: row.accountCode,
      accountSelectionReason: row.accountSelectionReason,
    })),
    warnings: [...draft.warnings],
  };
}

async function resolveVendorForConfirm<TCredentials>(params: {
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
  draft: InvoiceImportDraft;
  extraction: InvoiceExtraction;
}): Promise<ResolvedVendorForConfirm> {
  const matchedVendor = await params.activities.findVendor(
    params.credentials,
    {
      extraction: params.extraction,
    },
    params.context,
  );

  if (matchedVendor) {
    return {
      ...matchedVendor,
      createdVendor: false,
    };
  }

  try {
    const createdVendor = await params.activities.createVendor(
      params.credentials,
      {
        extraction: params.extraction,
        referenceData: params.context.referenceData,
      },
      params.context,
    );
    return {
      ...createdVendor,
      createdVendor: true,
    };
  } catch (error) {
    const fallbackVendor = await params.activities.findVendor(
      params.credentials,
      {
        extraction: params.extraction,
      },
      params.context,
    );
    if (fallbackVendor) {
      return {
        ...fallbackVendor,
        createdVendor: false,
      };
    }

    throw error;
  }
}

async function loadConfirmContext<TCredentials>(
  params: Pick<
    ConfirmWorkflowParams<TCredentials>,
    "savedConnection" | "activities" | "credentials"
  >,
) {
  const context = await measureInvoiceImportPhase({
    workflow: "confirm",
    provider: params.savedConnection.provider,
    phase: "loadContext",
    run: () => params.activities.loadContext(params.credentials),
  });
  assertReferenceAccounts(
    params.savedConnection,
    context.referenceData.accounts.length,
  );
  return context;
}

async function resolveDraftRows<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
  draft: InvoiceImportDraft;
}) {
  const resolvedRows: ProviderResolvedRow[] = [];

  for (const row of params.draft.rows) {
    if (row.articleDecision === "create") {
      throw new Error(
        `${formatInvoiceImportRowLabel(row.id)} must select an accounting article. In-app article creation is no longer supported.`,
      );
    }

    const articleCode = row.selectedArticleCode;
    const articleDescription = row.selectedArticleDescription;

    if (!articleCode || !articleDescription) {
      throw new Error(
        `${formatInvoiceImportRowLabel(row.id)} is missing an accounting article.`,
      );
    }

    resolvedRows.push({
      code: articleCode,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit ?? undefined,
      price: row.price ?? undefined,
      sum: row.sum ?? undefined,
      taxCode: row.taxCode ?? undefined,
      accountCode: row.accountCode,
      accountSelectionReason: row.accountSelectionReason,
    });
  }

  return resolvedRows;
}

async function createInvoiceWithAttachment<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
  vendor: ResolvedVendorForConfirm;
  extraction: InvoiceExtraction;
  resolvedRows: ProviderResolvedRow[];
  mimeType: string;
  filename: string;
  fileContentBase64: string;
}) {
  return measureInvoiceImportPhase({
    workflow: "confirm",
    provider: params.savedConnection.provider,
    phase: "createPurchaseInvoice",
    metadata: {
      rowCount: params.resolvedRows.length,
    },
    run: () =>
      params.activities.createPurchaseInvoice(
        params.credentials,
        {
          vendorId: params.vendor.vendorId,
          extraction: params.extraction,
          rows: params.resolvedRows,
          referenceData: params.context.referenceData,
          attachment: {
            filename: params.filename,
            mimeType: params.mimeType,
            fileContentBase64: params.fileContentBase64,
          },
        },
        params.context,
      ),
  });
}

function buildConfirmedResult(params: {
  provider: "smartaccounts" | "merit";
  invoiceId: string;
  invoiceNumber: string | null;
  vendor: ResolvedVendorForConfirm;
  attachedFile: boolean;
  paymentResult: Awaited<ReturnType<typeof recordPaymentIfNeeded>>;
  purchaseAccounts: ImportedInvoiceResult["purchaseAccounts"];
  extraction: InvoiceExtraction;
}): ImportedInvoiceResult {
  return {
    provider: params.provider,
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    vendorId: params.vendor.vendorId,
    vendorName: params.vendor.vendorName,
    createdVendor: params.vendor.createdVendor,
    attachedFile: params.attachedFile,
    createdPayment: params.paymentResult.createdPayment,
    paymentId: params.paymentResult.paymentId,
    purchaseAccounts: params.purchaseAccounts,
    paymentAccount: params.paymentResult.paymentAccount,
    extraction: params.extraction,
    alreadyExisted: false,
  };
}

async function finalizeConfirmedInvoice<TCredentials>(params: {
  workflow: ConfirmWorkflowParams<TCredentials>;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
  createdInvoice: Awaited<
    ReturnType<typeof createInvoiceWithAttachment<TCredentials>>
  >;
  vendor: ResolvedVendorForConfirm;
  extraction: InvoiceExtraction;
  purchaseAccounts: ImportedInvoiceResult["purchaseAccounts"];
  resolvedRows: ProviderResolvedRow[];
  fileContentBase64: string;
}) {
  const paymentResult = await measureInvoiceImportPhase({
    workflow: "confirm",
    provider: params.workflow.savedConnection.provider,
    phase: "recordPayment",
    metadata: {
      enabled: params.extraction.payment.isPaid,
    },
    run: () =>
      recordPaymentIfNeeded({
        activities: params.workflow.activities,
        credentials: params.workflow.credentials,
        context: params.context,
        createdInvoiceId: params.createdInvoice.invoiceId,
        extraction: params.extraction,
        vendorId: params.vendor.vendorId,
        vendorName: params.vendor.vendorName,
      }),
  });
  const attachedFile = await measureInvoiceImportPhase({
    workflow: "confirm",
    provider: params.workflow.savedConnection.provider,
    phase: "attachDocument",
    metadata: {
      inlineAttachmentSucceeded: params.createdInvoice.attachedFile ?? false,
    },
    run: () =>
      attachFileIfNeeded({
        activities: params.workflow.activities,
        credentials: params.workflow.credentials,
        context: params.context,
        createdInvoiceId: params.createdInvoice.invoiceId,
        createdInvoiceAttachedFile: params.createdInvoice.attachedFile,
        extraction: params.extraction,
        filename: params.workflow.filename,
        mimeType: params.workflow.mimeType,
        fileContentBase64: params.fileContentBase64,
      }),
  });
  const result = buildConfirmedResult({
    provider: params.workflow.savedConnection.provider,
    invoiceId: params.createdInvoice.invoiceId,
    invoiceNumber: params.workflow.draft.invoice.invoiceNumber,
    vendor: params.vendor,
    attachedFile,
    paymentResult,
    purchaseAccounts: params.purchaseAccounts,
    extraction: params.extraction,
  });

  logInvoiceImportEvent({
    workflow: "confirm",
    provider: params.workflow.savedConnection.provider,
    phase: "confirmResult",
    status: "success",
    metadata: {
      createdVendor: result.createdVendor,
      createdPayment: result.createdPayment,
      attachedFile: result.attachedFile,
      rowCount: params.resolvedRows.length,
      warningCount: params.extraction.warnings.length,
    },
  });

  return result;
}

export async function confirmInvoiceImport<TCredentials>(
  params: ConfirmWorkflowParams<TCredentials>,
): Promise<ImportedInvoiceResult> {
  const validationErrors = validateDraft(params.draft);
  if (validationErrors.length) {
    throw new Error(validationErrors[0]);
  }

  const context = await loadConfirmContext(params);
  const extraction = extractionFromDraft(params.draft);
  const fileContentBase64 = params.buffer.toString("base64");
  const vendor = await measureInvoiceImportPhase({
    workflow: "confirm",
    provider: params.savedConnection.provider,
    phase: "resolveVendor",
    metadata: {
      hasPreviewVendorMatch: Boolean(params.draft.vendor.existingVendorId),
    },
    run: () =>
      resolveVendorForConfirm({
        activities: params.activities,
        credentials: params.credentials,
        context,
        draft: params.draft,
        extraction,
      }),
  });
  const existingInvoice = await measureInvoiceImportPhase({
    workflow: "confirm",
    provider: params.savedConnection.provider,
    phase: "findExistingInvoice",
    run: () =>
      params.activities.findExistingInvoice(
        params.credentials,
        {
          vendorId: vendor.vendorId,
          invoiceNumber: params.draft.invoice.invoiceNumber,
          extraction,
        },
        context,
      ),
  });
  const resolvedRows = await resolveDraftRows({
    savedConnection: params.savedConnection,
    activities: params.activities,
    credentials: params.credentials,
    context,
    draft: params.draft,
  });
  const purchaseAccounts = uniqueAccounts(
    resolvedRows,
    context.referenceData.accounts,
  );

  if (existingInvoice) {
    return buildExistingResult({
      provider: params.savedConnection.provider,
      invoiceId: existingInvoice.invoiceId,
      invoiceNumber: params.draft.invoice.invoiceNumber,
      vendor,
      extraction,
      purchaseAccounts,
    });
  }

  const createdInvoice = await createInvoiceWithAttachment({
    savedConnection: params.savedConnection,
    activities: params.activities,
    credentials: params.credentials,
    context,
    vendor,
    extraction,
    resolvedRows,
    mimeType: params.mimeType,
    filename: params.filename,
    fileContentBase64,
  });
  return finalizeConfirmedInvoice({
    workflow: params,
    context,
    createdInvoice,
    vendor,
    extraction,
    purchaseAccounts,
    resolvedRows,
    fileContentBase64,
  });
}
