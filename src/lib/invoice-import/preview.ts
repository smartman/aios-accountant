import { AccountingProviderActivities } from "../accounting-provider-activities";
import {
  InvoiceExtraction,
  InvoiceImportDraft,
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "../invoice-import-types";
import { StoredAccountingConnection } from "../user-accounting-connections";
import {
  buildPreviewDuplicateInvoice,
  buildPreviewArticleOptions,
  buildPreviewUnitOptions,
  chooseDefaultPaymentAccount,
} from "./preview-helpers";
import { deriveInvoiceRoundingAmount } from "./amounts";
import { normalizeInvoiceImportDraft } from "./normalization";
import {
  logInvoiceImportEvent,
  measureInvoiceImportPhase,
} from "./observability";
import { resolvePreviewRows } from "./preview-row-resolution";
import { assertReferenceAccounts, extractInvoiceData } from "./workflow-utils";

async function findPreviewVendor<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  extraction: InvoiceExtraction;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
}) {
  return measureInvoiceImportPhase({
    workflow: "preview",
    provider: params.savedConnection.provider,
    phase: "findVendor",
    metadata: {
      hasVendorHints: Boolean(
        params.extraction.vendor.regCode ??
        params.extraction.vendor.vatNumber ??
        params.extraction.vendor.name,
      ),
    },
    run: () =>
      params.activities.findVendor(
        params.credentials,
        {
          extraction: params.extraction,
        },
        params.context,
      ),
  });
}

async function findPreviewDuplicate<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  extraction: InvoiceExtraction;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
  vendorMatch: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["findVendor"]>
  >;
}) {
  const invoiceNumber = params.extraction.invoice.invoiceNumber;
  if (!params.vendorMatch || !invoiceNumber) {
    return null;
  }

  const vendorId = params.vendorMatch.vendorId;

  return measureInvoiceImportPhase({
    workflow: "preview",
    provider: params.savedConnection.provider,
    phase: "findExistingInvoice",
    run: () =>
      params.activities.findExistingInvoice(
        params.credentials,
        {
          vendorId,
          invoiceNumber,
          extraction: params.extraction,
        },
        params.context,
      ),
  });
}

type PreviewVendorMatch = {
  vendorId: string;
  vendorName: string;
} | null;

type PreviewPaymentAccount = {
  name: string;
  type: "BANK" | "CASH";
  currency?: string;
};

function buildDraftVendor(
  extraction: InvoiceExtraction,
  vendorMatch: PreviewVendorMatch,
): InvoiceImportDraft["vendor"] {
  return {
    name: extraction.vendor.name ?? "",
    regCode: extraction.vendor.regCode,
    vatNumber: extraction.vendor.vatNumber,
    bankAccount: extraction.vendor.bankAccount,
    email: extraction.vendor.email,
    phone: extraction.vendor.phone,
    countryCode: extraction.vendor.countryCode,
    city: extraction.vendor.city,
    postalCode: extraction.vendor.postalCode,
    addressLine1: extraction.vendor.addressLine1,
    addressLine2: extraction.vendor.addressLine2,
    selectionMode: vendorMatch ? "existing" : "create",
    existingVendorId: vendorMatch?.vendorId ?? null,
    existingVendorName: vendorMatch?.vendorName ?? null,
  };
}

function buildDraftInvoice(
  extraction: InvoiceExtraction,
): InvoiceImportDraft["invoice"] {
  return {
    documentType: extraction.invoice.documentType,
    invoiceNumber: extraction.invoice.invoiceNumber!,
    referenceNumber: extraction.invoice.referenceNumber,
    currency: extraction.invoice.currency ?? "EUR",
    issueDate: extraction.invoice.issueDate ?? "",
    dueDate: extraction.invoice.dueDate,
    entryDate: extraction.invoice.entryDate,
    amountExcludingVat: extraction.invoice.amountExcludingVat,
    vatAmount: extraction.invoice.vatAmount,
    totalAmount: extraction.invoice.totalAmount,
    roundingAmount: deriveInvoiceRoundingAmount(extraction.invoice),
    notes: extraction.invoice.notes,
  };
}

function buildDraftPayment(
  extraction: InvoiceExtraction,
  paymentAccounts: PreviewPaymentAccount[],
): InvoiceImportDraft["payment"] {
  return {
    isPaid: extraction.payment.isPaid,
    paymentDate: extraction.payment.paymentDate,
    paymentAmount: extraction.payment.paymentAmount,
    paymentChannelHint: extraction.payment.paymentChannelHint,
    reason: extraction.payment.reason,
    paymentAccountName: chooseDefaultPaymentAccount(
      paymentAccounts,
      extraction.invoice.currency ?? "EUR",
      extraction.payment.paymentChannelHint,
    ),
  };
}

function buildDraftDimension(
  extraction: InvoiceExtraction,
): InvoiceImportDraft["dimension"] {
  return {
    code: extraction.dimension?.code ?? null,
    name: extraction.dimension?.name ?? null,
    reason: extraction.dimension?.reason ?? null,
  };
}

function buildPreviewDraft(params: {
  savedConnection: StoredAccountingConnection;
  extraction: InvoiceExtraction;
  paymentAccounts: PreviewPaymentAccount[];
  vendorMatch: PreviewVendorMatch;
  duplicateInvoiceId: string | null;
  rows: InvoiceImportDraftRow[];
}): InvoiceImportDraft {
  return normalizeInvoiceImportDraft({
    provider: params.savedConnection.provider,
    vendor: buildDraftVendor(params.extraction, params.vendorMatch),
    invoice: buildDraftInvoice(params.extraction),
    payment: buildDraftPayment(params.extraction, params.paymentAccounts),
    dimension: buildDraftDimension(params.extraction),
    actions: {
      createVendor: !params.vendorMatch,
      recordPayment: params.extraction.payment.isPaid,
    },
    rows: params.rows,
    warnings: params.extraction.warnings,
    duplicateInvoice: buildPreviewDuplicateInvoice({
      duplicateInvoiceId: params.duplicateInvoiceId,
      vendorMatch: params.vendorMatch,
      invoiceNumber: params.extraction.invoice.invoiceNumber,
    }),
  });
}

export async function previewInvoiceImport<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  mimeType: string;
  filename: string;
  buffer: Buffer;
  fingerprint: string;
}): Promise<InvoiceImportPreviewResult> {
  const context = await measureInvoiceImportPhase({
    workflow: "preview",
    provider: params.savedConnection.provider,
    phase: "loadContext",
    run: () => params.activities.loadContext(params.credentials),
  });
  assertReferenceAccounts(
    params.savedConnection,
    context.referenceData.accounts.length,
  );

  const extraction = await extractInvoiceData<TCredentials>(
    {
      ...params,
      workflow: "preview",
    },
    context.referenceData.accounts,
    context.referenceData.taxCodes,
    context.referenceData.dimensions ?? [],
  );
  const vendorMatch = await findPreviewVendor({
    savedConnection: params.savedConnection,
    activities: params.activities,
    credentials: params.credentials,
    extraction,
    context,
  });
  const duplicate = await findPreviewDuplicate({
    savedConnection: params.savedConnection,
    activities: params.activities,
    credentials: params.credentials,
    extraction,
    context,
    vendorMatch,
  });
  const { catalog, historyLoaded, rows } = await resolvePreviewRows({
    savedConnection: params.savedConnection,
    activities: params.activities,
    credentials: params.credentials,
    extraction,
    context,
    vendorMatch,
  });
  const draft = buildPreviewDraft({
    savedConnection: params.savedConnection,
    extraction,
    paymentAccounts: context.referenceData.paymentAccounts,
    vendorMatch,
    duplicateInvoiceId: duplicate?.invoiceId ?? null,
    rows,
  });
  const articleOptions = buildPreviewArticleOptions(catalog);
  const preview = {
    provider: params.savedConnection.provider,
    draft,
    extraction,
    unitOptions: buildPreviewUnitOptions({ catalog, context }),
    articleOptions,
    sourceArticleOptions: articleOptions.map((article) => ({
      code: article.code,
      description: article.description,
    })),
    referenceData: {
      accounts: context.referenceData.accounts.map((account) => ({
        code: account.code,
        label: account.label,
      })),
      taxCodes: context.referenceData.taxCodes.map((taxCode) => ({
        code: taxCode.code,
        description:
          taxCode.description ??
          [taxCode.code, taxCode.rate ? `${taxCode.rate}%` : ""]
            .filter(Boolean)
            .join(" - "),
        ...(typeof taxCode.rate === "number" && Number.isFinite(taxCode.rate)
          ? { rate: taxCode.rate }
          : {}),
      })),
      paymentAccounts: context.referenceData.paymentAccounts.map((account) => ({
        name: account.name,
        type: account.type,
      })),
      dimensions: (context.referenceData.dimensions ?? []).map((dimension) => ({
        code: dimension.code,
        name: dimension.name,
      })),
    },
  };

  logInvoiceImportEvent({
    workflow: "preview",
    provider: params.savedConnection.provider,
    phase: "previewResult",
    status: "success",
    metadata: {
      duplicateFound: Boolean(duplicate),
      historyLoaded,
      vendorMatched: Boolean(vendorMatch),
      rowCount: draft.rows.length,
      warningCount: extraction.warnings.length,
    },
  });

  return preview;
}
