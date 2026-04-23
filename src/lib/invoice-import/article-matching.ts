import {
  ProviderCatalogArticle,
  ProviderHistoricalInvoiceRow,
} from "../accounting-provider-activities";
import {
  InvoiceImportDraftRow,
  InvoiceImportReviewArticleCandidate,
} from "../invoice-import-types";

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

function scoreOverlap(haystack: string, needles: string[]): number {
  const normalizedHaystack = normalizeText(haystack);
  let score = 0;

  for (const needle of needles) {
    const normalizedNeedle = normalizeText(needle);
    if (!normalizedNeedle) {
      continue;
    }
    if (normalizedHaystack.includes(normalizedNeedle)) {
      score += normalizedNeedle.length;
    }
  }

  return score;
}

function scoreTokenOverlap(haystack: string, needles: string[]): number {
  const haystackTokens = new Set(tokenize(haystack));
  let score = 0;

  for (const needle of needles) {
    for (const token of tokenize(needle)) {
      if (haystackTokens.has(token)) {
        score += token.length;
      }
    }
  }

  return score;
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

function makeCandidate(params: {
  article: ProviderCatalogArticle;
  score: number;
  reasons: string[];
  historyMatches: number;
  recentInvoiceDate?: string;
}): InvoiceImportReviewArticleCandidate {
  return {
    code: params.article.code,
    description: params.article.description,
    unit: params.article.unit ?? null,
    purchaseAccountCode: params.article.purchaseAccountCode ?? null,
    taxCode: params.article.taxCode ?? null,
    type: params.article.type ?? null,
    score: params.score,
    reasons: uniqueReasons(params.reasons),
    historyMatches: params.historyMatches,
    recentInvoiceDate: params.recentInvoiceDate ?? null,
  };
}

interface CandidateRanking {
  descriptionMatch: number;
  historyMatch: number;
  sourceCodeMatch: number;
  metadataMatch: number;
}

function buildRowNeedles(row: InvoiceImportDraftRow): string[] {
  return [row.description].filter((value): value is string => Boolean(value));
}

function computeHistoryScoreBoost(params: {
  entry: ProviderHistoricalInvoiceRow;
  row: InvoiceImportDraftRow;
  similarity: number;
}): number {
  let scoreBoost = params.similarity + 20;

  if (
    params.entry.purchaseAccountCode &&
    params.entry.purchaseAccountCode === params.row.accountCode
  ) {
    scoreBoost += 15;
  }

  if (params.entry.taxCode && params.entry.taxCode === params.row.taxCode) {
    scoreBoost += 8;
  }

  if (params.entry.unit && params.entry.unit === params.row.unit) {
    scoreBoost += 6;
  }

  return scoreBoost;
}

function buildHistoryByArticle(params: {
  row: InvoiceImportDraftRow;
  history: ProviderHistoricalInvoiceRow[];
  rowNeedles: string[];
}) {
  const historyByArticle = new Map<
    string,
    { matches: number; recentInvoiceDate?: string; scoreBoost: number }
  >();

  for (const entry of params.history) {
    const entryValues = [
      entry.sourceArticleCode,
      entry.description,
      entry.articleCode,
      entry.articleDescription,
    ].filter((value): value is string => Boolean(value));
    const similarity =
      scoreOverlap(entryValues.join(" "), params.rowNeedles) +
      scoreTokenOverlap(entryValues.join(" "), params.rowNeedles);

    if (!similarity) {
      continue;
    }

    const current = historyByArticle.get(entry.articleCode);
    historyByArticle.set(entry.articleCode, {
      matches: (current?.matches ?? 0) + 1,
      recentInvoiceDate:
        !current?.recentInvoiceDate ||
        (entry.issueDate ?? "") > current.recentInvoiceDate
          ? entry.issueDate
          : current.recentInvoiceDate,
      scoreBoost:
        Math.max(
          current?.scoreBoost ?? 0,
          computeHistoryScoreBoost({
            entry,
            row: params.row,
            similarity,
          }),
        ) + (current ? 4 : 0),
    });
  }

  return historyByArticle;
}

function scoreCatalogArticle(params: {
  article: ProviderCatalogArticle;
  row: InvoiceImportDraftRow;
  rowNeedles: string[];
  historyByArticle: Map<
    string,
    { matches: number; recentInvoiceDate?: string; scoreBoost: number }
  >;
}): {
  candidate: InvoiceImportReviewArticleCandidate;
  ranking: CandidateRanking;
} {
  const reasons: string[] = [];
  let sourceCodeMatch = 0;
  let descriptionMatch = 0;
  let historyMatchScore = 0;
  let metadataMatch = 0;
  const articleDescription = params.article.description;

  const hasExactSourceCodeMatch =
    params.row.sourceArticleCode &&
    normalizeText(params.article.code) ===
      normalizeText(params.row.sourceArticleCode);
  if (hasExactSourceCodeMatch) {
    sourceCodeMatch = 1;
    reasons.push("Exact source article code match.");
  }

  const codeAndDescriptionScore =
    scoreOverlap(articleDescription, params.rowNeedles) +
    scoreTokenOverlap(articleDescription, params.rowNeedles);
  if (codeAndDescriptionScore) {
    descriptionMatch = codeAndDescriptionScore;
    reasons.push("Catalog description matches the invoice row.");
  }

  if (
    params.article.purchaseAccountCode &&
    params.article.purchaseAccountCode === params.row.accountCode
  ) {
    metadataMatch += 20;
    reasons.push("Purchase account matches.");
  }

  if (params.article.taxCode && params.article.taxCode === params.row.taxCode) {
    metadataMatch += 8;
    reasons.push("VAT code matches.");
  }

  if (params.article.unit && params.article.unit === params.row.unit) {
    metadataMatch += 5;
    reasons.push("Unit matches.");
  }

  const historyMatch = params.historyByArticle.get(params.article.code);
  if (historyMatch) {
    historyMatchScore = historyMatch.scoreBoost + historyMatch.matches * 3;
    reasons.push("Previous invoices from the same vendor used this article.");
  }

  return {
    candidate: makeCandidate({
      article: params.article,
      score:
        sourceCodeMatch * 45 +
        descriptionMatch +
        historyMatchScore +
        metadataMatch,
      reasons,
      historyMatches: historyMatch?.matches ?? 0,
      recentInvoiceDate: historyMatch?.recentInvoiceDate,
    }),
    ranking: {
      descriptionMatch,
      historyMatch: historyMatchScore,
      sourceCodeMatch,
      metadataMatch,
    },
  };
}

export function buildArticleCandidates(params: {
  row: InvoiceImportDraftRow;
  catalog: ProviderCatalogArticle[];
  history: ProviderHistoricalInvoiceRow[];
}): InvoiceImportReviewArticleCandidate[] {
  const rowNeedles = buildRowNeedles(params.row);
  const historyByArticle = buildHistoryByArticle({
    row: params.row,
    history: params.history,
    rowNeedles,
  });

  const ranked = params.catalog
    .filter((article) => article.activePurchase !== false)
    .map((article) =>
      scoreCatalogArticle({
        article,
        row: params.row,
        rowNeedles,
        historyByArticle,
      }),
    )
    .filter(
      ({ ranking }) =>
        ranking.descriptionMatch > 0 ||
        ranking.historyMatch > 0 ||
        ranking.sourceCodeMatch > 0 ||
        ranking.metadataMatch > 0,
    )
    .sort((left, right) => {
      if (right.ranking.descriptionMatch !== left.ranking.descriptionMatch) {
        return right.ranking.descriptionMatch - left.ranking.descriptionMatch;
      }

      if (right.ranking.historyMatch !== left.ranking.historyMatch) {
        return right.ranking.historyMatch - left.ranking.historyMatch;
      }

      if (right.ranking.sourceCodeMatch !== left.ranking.sourceCodeMatch) {
        return right.ranking.sourceCodeMatch - left.ranking.sourceCodeMatch;
      }

      if (right.ranking.metadataMatch !== left.ranking.metadataMatch) {
        return right.ranking.metadataMatch - left.ranking.metadataMatch;
      }

      return right.candidate.score - left.candidate.score;
    })
    .map(({ candidate }) => candidate)
    .slice(0, 8);

  return ranked;
}

export function getArticleSuggestionStatus(
  candidates: InvoiceImportReviewArticleCandidate[],
): "clear" | "ambiguous" | "missing" {
  const top = candidates[0];
  const runnerUp = candidates[1];

  if (!top) {
    return "missing";
  }

  if (top.score >= 30 && top.score - (runnerUp?.score ?? 0) >= 10) {
    return "clear";
  }

  return "ambiguous";
}
