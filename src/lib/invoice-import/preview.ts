import { AccountingProviderActivities } from "../accounting-provider-activities";
import {
  InvoiceExtraction,
  InvoiceImportDraft,
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "../invoice-import-types";
import {
  fallbackRowFromInvoice,
  resolvePurchaseRows,
} from "../provider-import-helpers";
import { StoredAccountingConnection } from "../user-accounting-connections";
import {
  buildPreviewDuplicateInvoice,
  buildPreviewArticleOptions,
  buildPreviewArticleTypeOptions,
  buildPreviewUnitOptions,
  chooseDefaultPaymentAccount,
  createRowId,
  defaultNewArticleCode,
} from "./preview-helpers";
import {
  buildArticleCandidates,
  getArticleSuggestionStatus,
} from "./article-matching";
import {
  logInvoiceImportEvent,
  measureInvoiceImportPhase,
} from "./observability";
import { assertReferenceAccounts, extractInvoiceData } from "./workflow-utils";

function buildFallbackExtraction(): InvoiceExtraction {
  return {
    vendor: {
      name: null,
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: null,
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
    },
    invoice: {
      documentType: null,
      invoiceNumber: null,
      referenceNumber: null,
      currency: null,
      issueDate: null,
      dueDate: null,
      entryDate: null,
      amountExcludingVat: null,
      vatAmount: null,
      totalAmount: null,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [],
    warnings: [],
  };
}

function buildDraftRow(params: {
  resolvedRow: ReturnType<typeof resolvePurchaseRows>[number];
  sourceRow: InvoiceExtraction["rows"][number];
  catalog: Awaited<
    ReturnType<AccountingProviderActivities<unknown>["listArticles"]>
  >;
  history: Awaited<
    ReturnType<AccountingProviderActivities<unknown>["getVendorArticleHistory"]>
  >;
  index: number;
}): InvoiceImportDraftRow {
  const sourceArticleCode = params.sourceRow.sourceArticleCode ?? null;
  const baseRow = buildBaseDraftRow({
    index: params.index,
    sourceArticleCode,
    sourceRow: params.sourceRow,
    resolvedRow: params.resolvedRow,
  });
  const candidates = buildArticleCandidates({
    row: baseRow,
    catalog: params.catalog,
    history: params.history,
  });
  const suggestionStatus = getArticleSuggestionStatus(candidates);
  const defaultCandidate =
    suggestionStatus === "clear" ? (candidates[0] ?? null) : null;

  return {
    ...baseRow,
    articleDecision: "existing",
    unit: defaultCandidate?.unit ?? baseRow.unit,
    selectedArticleCode: defaultCandidate?.code ?? null,
    selectedArticleDescription: defaultCandidate?.description ?? null,
    articleCandidates: candidates,
    suggestionStatus,
    newArticle: buildSuggestedNewArticle({
      sourceArticleCode,
      resolvedRow: params.resolvedRow,
    }),
  };
}

function buildBaseDraftRow(params: {
  index: number;
  sourceArticleCode: string | null;
  sourceRow: InvoiceExtraction["rows"][number];
  resolvedRow: ReturnType<typeof resolvePurchaseRows>[number];
}): InvoiceImportDraftRow {
  return {
    id: createRowId(params.index),
    sourceArticleCode: params.sourceArticleCode,
    description: params.resolvedRow.description,
    quantity: params.resolvedRow.quantity ?? 1,
    unit: params.resolvedRow.unit ?? null,
    price: params.resolvedRow.price ?? null,
    sum: params.resolvedRow.sum ?? null,
    vatRate: params.sourceRow.vatRate ?? null,
    taxCode: params.resolvedRow.taxCode ?? null,
    accountCode: params.resolvedRow.accountCode,
    accountSelectionReason: params.resolvedRow.accountSelectionReason,
    articleDecision: "existing",
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
    newArticle: {
      code: "",
      description: "",
      unit: params.resolvedRow.unit ?? "",
      type: "SERVICE",
      purchaseAccountCode: params.resolvedRow.accountCode,
      taxCode: params.resolvedRow.taxCode ?? null,
    },
  };
}

function buildSuggestedNewArticle(params: {
  sourceArticleCode: string | null;
  resolvedRow: ReturnType<typeof resolvePurchaseRows>[number];
}) {
  return {
    code: defaultNewArticleCode({
      sourceArticleCode: params.sourceArticleCode,
      description: params.resolvedRow.description,
      accountCode: params.resolvedRow.accountCode,
    }),
    description: params.resolvedRow.description,
    unit: params.resolvedRow.unit ?? "",
    type: "SERVICE",
    purchaseAccountCode: params.resolvedRow.accountCode,
    taxCode: params.resolvedRow.taxCode ?? null,
  };
}

function buildDraftRows(params: {
  sourceRows: InvoiceExtraction["rows"];
  resolvedRows: ReturnType<typeof resolvePurchaseRows>;
  catalog: Awaited<
    ReturnType<AccountingProviderActivities<unknown>["listArticles"]>
  >;
  history: Awaited<
    ReturnType<AccountingProviderActivities<unknown>["getVendorArticleHistory"]>
  >;
}): InvoiceImportDraftRow[] {
  return params.resolvedRows.map((resolvedRow, index) =>
    buildDraftRow({
      resolvedRow,
      sourceRow:
        params.sourceRows[index] ??
        fallbackRowFromInvoice(buildFallbackExtraction()),
      catalog: params.catalog,
      history: params.history,
      index,
    }),
  );
}

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

async function loadPreviewCatalogAndHistory<TCredentials>(params: {
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
  const catalog = await measureInvoiceImportPhase({
    workflow: "preview",
    provider: params.savedConnection.provider,
    phase: "listArticles",
    run: () =>
      params.activities.listArticles(params.credentials, params.context),
  });
  const matchedVendor = params.vendorMatch;
  const history = matchedVendor
    ? await measureInvoiceImportPhase({
        workflow: "preview",
        provider: params.savedConnection.provider,
        phase: "getVendorArticleHistory",
        run: () =>
          params.activities.getVendorArticleHistory(
            params.credentials,
            {
              vendorId: matchedVendor.vendorId,
              extraction: params.extraction,
            },
            params.context,
          ),
      })
    : [];

  return { catalog, history };
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
  return {
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
  };
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
  const { catalog, history } = await loadPreviewCatalogAndHistory({
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
    rows: buildDraftRows({
      sourceRows: extraction.rows.length
        ? extraction.rows
        : [fallbackRowFromInvoice(extraction)],
      resolvedRows: resolvePurchaseRows({
        extraction,
        referenceData: context.referenceData,
      }),
      catalog,
      history,
    }),
  });
  const articleOptions = buildPreviewArticleOptions(catalog);
  const preview = {
    provider: params.savedConnection.provider,
    draft,
    extraction,
    articleTypeOptions: buildPreviewArticleTypeOptions(catalog),
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
      vendorMatched: Boolean(vendorMatch),
      rowCount: draft.rows.length,
      warningCount: extraction.warnings.length,
    },
  });

  return preview;
}
