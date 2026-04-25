import { AccountingProviderActivities } from "../accounting-provider-activities";
import {
  InvoiceExtraction,
  InvoiceImportDraftRow,
} from "../invoice-import-types";
import {
  fallbackRowFromInvoice,
  resolvePurchaseRows,
} from "../provider-import-helpers";
import { StoredAccountingConnection } from "../user-accounting-connections";
import {
  buildArticleSuggestionReason,
  buildArticleCandidates,
  getArticleSuggestionStatus,
} from "./article-matching";
import {
  applyAiArticleMatches,
  matchArticlesWithOpenRouter,
} from "./article-matching-ai";
import { createRowId } from "./preview-helpers";
import {
  logInvoiceImportEvent,
  measureInvoiceImportPhase,
} from "./observability";

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
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "missing",
    articleSuggestionReason: null,
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
    unit: defaultCandidate?.unit ?? baseRow.unit,
    selectedArticleCode: defaultCandidate?.code ?? null,
    selectedArticleDescription: defaultCandidate?.description ?? null,
    articleCandidates: candidates,
    suggestionStatus,
    articleSuggestionReason: buildArticleSuggestionReason(candidates),
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

async function loadPreviewCatalog<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >;
}) {
  return measureInvoiceImportPhase({
    workflow: "preview",
    provider: params.savedConnection.provider,
    phase: "listArticles",
    run: () =>
      params.activities.listArticles(params.credentials, params.context),
  });
}

async function loadPreviewVendorHistory<TCredentials>(params: {
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
  const matchedVendor = params.vendorMatch!;

  return measureInvoiceImportPhase({
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
  });
}

async function matchPreviewRowsWithAi(params: {
  savedConnection: StoredAccountingConnection;
  rows: InvoiceImportDraftRow[];
  catalog: Awaited<
    ReturnType<AccountingProviderActivities<unknown>["listArticles"]>
  >;
  history: Awaited<
    ReturnType<AccountingProviderActivities<unknown>["getVendorArticleHistory"]>
  >;
}) {
  try {
    const matches = await measureInvoiceImportPhase({
      workflow: "preview",
      provider: params.savedConnection.provider,
      phase: "matchArticles",
      metadata: {
        articleCount: params.catalog.length,
        historyCount: params.history.length,
        rowCount: params.rows.length,
      },
      run: () =>
        matchArticlesWithOpenRouter({
          provider: params.savedConnection.provider,
          rows: params.rows,
          catalog: params.catalog,
          history: params.history,
          companyContext: params.savedConnection.companyContext,
        }),
    });

    return matches
      ? applyAiArticleMatches({
          rows: params.rows,
          catalog: params.catalog,
          matches,
        })
      : params.rows;
  } catch {
    logInvoiceImportEvent({
      workflow: "preview",
      provider: params.savedConnection.provider,
      phase: "matchArticles.fallback",
      status: "success",
      metadata: {
        fallback: "heuristic",
      },
    });

    return params.rows;
  }
}

function shouldLoadVendorHistory(rows: InvoiceImportDraftRow[]): boolean {
  return rows.some((row) => row.suggestionStatus !== "clear");
}

export async function resolvePreviewRows<TCredentials>(params: {
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
  const catalog = await loadPreviewCatalog(params);
  const sourceRows = params.extraction.rows.length
    ? params.extraction.rows
    : [fallbackRowFromInvoice(params.extraction)];
  const resolvedRows = resolvePurchaseRows({
    extraction: params.extraction,
    referenceData: params.context.referenceData,
  });
  const initialRows = buildDraftRows({
    sourceRows,
    resolvedRows,
    catalog,
    history: [],
  });
  const history =
    params.vendorMatch && shouldLoadVendorHistory(initialRows)
      ? await loadPreviewVendorHistory(params)
      : [];
  const heuristicRows = buildDraftRows({
    sourceRows,
    resolvedRows,
    catalog,
    history,
  });

  return {
    catalog,
    historyLoaded: history.length > 0,
    rows: await matchPreviewRowsWithAi({
      savedConnection: params.savedConnection,
      rows: heuristicRows,
      catalog,
      history,
    }),
  };
}
