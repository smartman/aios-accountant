import {
  ProviderCatalogArticle,
  ProviderHistoricalInvoiceRow,
} from "../accounting-provider-activities";
import { AccountingProvider } from "../accounting-provider-types";
import {
  InvoiceImportDraftRow,
  InvoiceImportReviewArticleCandidate,
} from "../invoice-import-types";
import {
  applyAiSelectionToRow,
  buildAiReasons,
  buildAiScore,
  preferValue,
  resolveAppliedAiSelection,
} from "./article-matching-ai-helpers";
import { requestOpenAIStructuredOutput } from "../openai-client";

interface OpenAIArticleMatch {
  rowId: string;
  status: "clear" | "ambiguous" | "missing";
  selectedArticleCode: string | null;
  alternativeArticleCodes: string[];
  reason: string;
}

interface OpenAIArticleMatchResponse {
  rows: OpenAIArticleMatch[];
}

const ARTICLE_MATCH_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "rowId",
          "status",
          "selectedArticleCode",
          "alternativeArticleCodes",
          "reason",
        ],
        properties: {
          rowId: { type: "string" },
          status: {
            type: "string",
            enum: ["clear", "ambiguous", "missing"],
          },
          selectedArticleCode: { type: ["string", "null"] },
          alternativeArticleCodes: {
            type: "array",
            items: { type: "string" },
          },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function openAIArticleMatchSchema() {
  return {
    name: "invoice_article_match_payload",
    strict: true as const,
    schema: ARTICLE_MATCH_RESPONSE_SCHEMA,
  };
}

function getOpenAIConfig(): {
  apiKey: string;
  model: string;
} | null {
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_ARTICLE_MATCH_MODEL?.trim() || "gpt-5.5";

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model,
  };
}

function buildSystemPrompt(): string {
  return [
    "You choose the best existing accounting article for supplier invoice rows.",
    "Pick from the provided catalog articles only.",
    "Use the invoice row meaning and the catalog article description as the primary signal.",
    "Treat vendor history, account code, VAT code, unit, and source article code as supporting evidence.",
    "A row like 'Elekter oine jaanuar 2025' should usually match an article described as 'Elekter' when that is the obvious best fit.",
    "A compound row label like 'Uldelekter oine jaanuar 2025' should still match the base article 'Elekter' when no more specific electricity article exists.",
    "Return status 'clear' only when one article is clearly the best existing choice.",
    "Return status 'ambiguous' when more than one existing article remains plausible.",
    "Return status 'missing' when none of the existing catalog articles fit well enough.",
    "Never invent article codes or descriptions.",
    "Keep the reason short and specific.",
  ].join("\n");
}

function summarizeVendorHistory(history: ProviderHistoricalInvoiceRow[]) {
  const historyByArticle = new Map<
    string,
    {
      articleCode: string;
      articleDescription: string | null;
      purchaseAccountCode: string | null;
      taxCode: string | null;
      unit: string | null;
      matches: number;
      recentInvoiceDate: string | null;
      sampleDescriptions: string[];
    }
  >();

  for (const entry of history) {
    const current = historyByArticle.get(entry.articleCode) ?? {
      articleCode: entry.articleCode,
      articleDescription: entry.articleDescription ?? null,
      purchaseAccountCode: entry.purchaseAccountCode ?? null,
      taxCode: entry.taxCode ?? null,
      unit: entry.unit ?? null,
      matches: 0,
      recentInvoiceDate: null,
      sampleDescriptions: [],
    };

    current.matches += 1;
    current.recentInvoiceDate =
      !current.recentInvoiceDate ||
      (entry.issueDate ?? "") > current.recentInvoiceDate
        ? (entry.issueDate ?? null)
        : current.recentInvoiceDate;

    if (
      entry.description &&
      current.sampleDescriptions.length < 3 &&
      !current.sampleDescriptions.includes(entry.description)
    ) {
      current.sampleDescriptions.push(entry.description);
    }

    historyByArticle.set(entry.articleCode, current);
  }

  return [...historyByArticle.values()]
    .sort((left, right) => {
      if (right.matches !== left.matches) {
        return right.matches - left.matches;
      }

      return (right.recentInvoiceDate ?? "").localeCompare(
        left.recentInvoiceDate ?? "",
      );
    })
    .slice(0, 40);
}

function buildUserPrompt(params: {
  provider: AccountingProvider;
  rows: InvoiceImportDraftRow[];
  catalog: ProviderCatalogArticle[];
  history: ProviderHistoricalInvoiceRow[];
  companyContext?: string | null;
}): string {
  const providerLabel =
    params.provider === "smartaccounts" ? "SmartAccounts" : "Merit";
  const activeCatalog = params.catalog
    .filter((article) => article.activePurchase !== false)
    .map((article) => ({
      code: article.code,
      description: article.description,
      unit: article.unit ?? null,
      purchaseAccountCode: article.purchaseAccountCode ?? null,
      taxCode: article.taxCode ?? null,
      type: article.type ?? null,
    }));
  const rows = params.rows.map((row) => ({
    rowId: row.id,
    sourceArticleCode: row.sourceArticleCode,
    description: row.description,
    unit: row.unit,
    accountCode: row.accountCode,
    taxCode: row.taxCode,
  }));

  return [
    `Return only structured article matching decisions for importing purchase invoice rows into ${providerLabel}.`,
    params.companyContext?.trim() ? params.companyContext.trim() : null,
    "Each returned rowId must match one of the provided rows.",
    "selectedArticleCode and alternativeArticleCodes must come from the provided catalog article codes.",
    "If the row description clearly starts with or contains a catalog article description, prefer that article unless stronger conflicting evidence exists.",
    `Rows to classify: ${JSON.stringify(rows)}`,
    `Available catalog articles: ${JSON.stringify(activeCatalog)}`,
    `Vendor history summary: ${JSON.stringify(summarizeVendorHistory(params.history))}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAiCandidate(params: {
  article: ProviderCatalogArticle;
  existingCandidate?: InvoiceImportReviewArticleCandidate;
  aiReason: string;
  rank: number;
}): InvoiceImportReviewArticleCandidate {
  const existingCandidate = params.existingCandidate;

  return {
    code: params.article.code,
    description: existingCandidate?.description ?? params.article.description,
    unit: preferValue(existingCandidate?.unit, params.article.unit),
    purchaseAccountCode: preferValue(
      existingCandidate?.purchaseAccountCode,
      params.article.purchaseAccountCode,
    ),
    taxCode: preferValue(existingCandidate?.taxCode, params.article.taxCode),
    type: preferValue(existingCandidate?.type, params.article.type),
    score: buildAiScore(existingCandidate?.score, params.rank),
    reasons: buildAiReasons(params.aiReason, existingCandidate?.reasons),
    historyMatches: existingCandidate?.historyMatches ?? 0,
    recentInvoiceDate: existingCandidate?.recentInvoiceDate ?? null,
  };
}

function normalizeAiMatch(params: {
  match: OpenAIArticleMatch;
  catalogByCode: Map<string, ProviderCatalogArticle>;
}): {
  status: "clear" | "ambiguous" | "missing";
  rankedCodes: string[];
  reason: string;
} | null {
  if (params.match.status === "missing") {
    return {
      status: "missing",
      rankedCodes: [],
      reason: params.match.reason.trim() || "No existing catalog article fit.",
    };
  }

  const rankedCodes = [
    params.match.selectedArticleCode,
    ...params.match.alternativeArticleCodes,
  ]
    .filter((code): code is string => typeof code === "string")
    .filter(
      (code, index, all) =>
        params.catalogByCode.has(code) && all.indexOf(code) === index,
    );

  if (!rankedCodes.length) {
    return null;
  }

  return {
    status: params.match.status,
    rankedCodes,
    reason:
      params.match.reason.trim() || "Matched the invoice row to this article.",
  };
}

function mergeAiCandidates(params: {
  row: InvoiceImportDraftRow;
  match: OpenAIArticleMatch;
  catalogByCode: Map<string, ProviderCatalogArticle>;
}): InvoiceImportReviewArticleCandidate[] | null {
  const normalizedMatch = normalizeAiMatch({
    match: params.match,
    catalogByCode: params.catalogByCode,
  });

  if (!normalizedMatch) {
    return null;
  }

  if (normalizedMatch.status === "missing") {
    return params.row.articleCandidates;
  }

  const existingByCode = new Map(
    params.row.articleCandidates.map((candidate) => [
      candidate.code,
      candidate,
    ]),
  );
  const aiCandidates = normalizedMatch.rankedCodes.map((code, index) => {
    const article = params.catalogByCode.get(code)!;
    return buildAiCandidate({
      article,
      existingCandidate: existingByCode.get(code),
      aiReason: normalizedMatch.reason,
      rank: index,
    });
  });
  const aiCodes = new Set(aiCandidates.map((candidate) => candidate.code));

  return [
    ...aiCandidates,
    ...params.row.articleCandidates.filter(
      (candidate) => !aiCodes.has(candidate.code),
    ),
  ].slice(0, 8);
}

function resolveAiCandidatesForRow(params: {
  row: InvoiceImportDraftRow;
  catalogByCode: Map<string, ProviderCatalogArticle>;
  match?: OpenAIArticleMatch;
}) {
  if (!params.match) {
    return null;
  }

  return mergeAiCandidates({
    row: params.row,
    match: params.match,
    catalogByCode: params.catalogByCode,
  });
}

function applyAiMatchToRow(params: {
  row: InvoiceImportDraftRow;
  catalogByCode: Map<string, ProviderCatalogArticle>;
  match?: OpenAIArticleMatch;
}): InvoiceImportDraftRow {
  const mergedCandidates = resolveAiCandidatesForRow(params);

  if (!params.match || !mergedCandidates) {
    return params.row;
  }

  const { selectedCandidate, suggestionStatus } = resolveAppliedAiSelection({
    existingStatus: params.row.suggestionStatus,
    aiStatus: params.match.status,
    aiSelectedArticleCode: params.match.selectedArticleCode,
    alternativeArticleCodes: params.match.alternativeArticleCodes,
    currentSelectedArticleCode: params.row.selectedArticleCode,
    topCandidateCode: mergedCandidates[0]?.code ?? null,
    candidates: mergedCandidates,
  });

  return applyAiSelectionToRow({
    row: params.row,
    selectedCandidate,
    mergedCandidates,
    suggestionStatus,
    reason: params.match.reason,
  });
}

export function applyAiArticleMatches(params: {
  rows: InvoiceImportDraftRow[];
  catalog: ProviderCatalogArticle[];
  matches: OpenAIArticleMatch[];
}): InvoiceImportDraftRow[] {
  const catalogByCode = new Map(
    params.catalog.map((article) => [article.code, article] as const),
  );
  const matchesByRowId = new Map(
    params.matches.map((match) => [match.rowId, match] as const),
  );

  return params.rows.map((row) =>
    applyAiMatchToRow({
      row,
      catalogByCode,
      match: matchesByRowId.get(row.id),
    }),
  );
}

export async function matchArticlesWithOpenAI(params: {
  provider: AccountingProvider;
  rows: InvoiceImportDraftRow[];
  catalog: ProviderCatalogArticle[];
  history: ProviderHistoricalInvoiceRow[];
  companyContext?: string | null;
}): Promise<OpenAIArticleMatch[] | null> {
  const config = getOpenAIConfig();

  if (!config || params.rows.length === 0 || params.catalog.length === 0) {
    return null;
  }

  const parsed =
    await requestOpenAIStructuredOutput<OpenAIArticleMatchResponse>({
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: buildSystemPrompt(),
      userContent: [{ type: "input_text", text: buildUserPrompt(params) }],
      jsonSchema: openAIArticleMatchSchema(),
      promptCacheKey: "invoice-article-matching",
      invalidJsonMessage:
        "OpenAI did not return valid JSON for the article matcher.",
    });

  return parsed.rows ?? [];
}

export const __test__ = {
  buildSystemPrompt,
  buildUserPrompt,
  summarizeVendorHistory,
};
