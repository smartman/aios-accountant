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

function buildPreviewDraft(params: {
  savedConnection: StoredAccountingConnection;
  extraction: InvoiceExtraction;
  paymentAccounts: Array<{
    name: string;
    type: "BANK" | "CASH";
    currency?: string;
  }>;
  vendorMatch: { vendorId: string; vendorName: string } | null;
  duplicateInvoiceId: string | null;
  rows: InvoiceImportDraftRow[];
}): InvoiceImportDraft {
  return normalizeInvoiceImportDraft({
    provider: params.savedConnection.provider,
    vendor: {
      name: params.extraction.vendor.name ?? "",
      regCode: params.extraction.vendor.regCode,
      vatNumber: params.extraction.vendor.vatNumber,
      bankAccount: params.extraction.vendor.bankAccount,
      email: params.extraction.vendor.email,
      phone: params.extraction.vendor.phone,
      countryCode: params.extraction.vendor.countryCode,
      city: params.extraction.vendor.city,
      postalCode: params.extraction.vendor.postalCode,
      addressLine1: params.extraction.vendor.addressLine1,
      addressLine2: params.extraction.vendor.addressLine2,
      selectionMode: params.vendorMatch ? "existing" : "create",
      existingVendorId: params.vendorMatch?.vendorId ?? null,
      existingVendorName: params.vendorMatch?.vendorName ?? null,
    },
    invoice: {
      documentType: params.extraction.invoice.documentType,
      invoiceNumber: params.extraction.invoice.invoiceNumber!,
      referenceNumber: params.extraction.invoice.referenceNumber,
      currency: params.extraction.invoice.currency ?? "EUR",
      issueDate: params.extraction.invoice.issueDate ?? "",
      dueDate: params.extraction.invoice.dueDate,
      entryDate: params.extraction.invoice.entryDate,
      amountExcludingVat: params.extraction.invoice.amountExcludingVat,
      vatAmount: params.extraction.invoice.vatAmount,
      totalAmount: params.extraction.invoice.totalAmount,
      notes: params.extraction.invoice.notes,
    },
    payment: {
      isPaid: params.extraction.payment.isPaid,
      paymentDate: params.extraction.payment.paymentDate,
      paymentAmount: params.extraction.payment.paymentAmount,
      paymentChannelHint: params.extraction.payment.paymentChannelHint,
      reason: params.extraction.payment.reason,
      paymentAccountName: chooseDefaultPaymentAccount(
        params.paymentAccounts,
        params.extraction.invoice.currency ?? "EUR",
        params.extraction.payment.paymentChannelHint,
      ),
    },
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
