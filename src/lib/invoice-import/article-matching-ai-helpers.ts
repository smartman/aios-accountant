import {
  InvoiceImportDraftRow,
  InvoiceImportReviewArticleCandidate,
} from "../invoice-import-types";

export function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

export function preferValue<T>(
  ...values: Array<T | null | undefined>
): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

export function buildAiScore(
  existingScore: number | undefined,
  rank: number,
): number {
  return Math.max(existingScore ?? 0, 120 - rank * 10);
}

export function buildAiReasons(
  aiReason: string,
  existingReasons?: string[],
): string[] {
  return uniqueReasons([
    `AI article matcher: ${aiReason}`,
    ...(existingReasons ?? []),
  ]);
}

export function selectAiCandidate(
  status: "clear" | "ambiguous" | "missing",
  candidates: InvoiceImportReviewArticleCandidate[],
): InvoiceImportReviewArticleCandidate | null {
  return status === "clear" ? (candidates[0] ?? null) : null;
}

export function resolveAiSuggestionStatus(
  status: "clear" | "ambiguous" | "missing",
  candidateCount: number,
): InvoiceImportDraftRow["suggestionStatus"] {
  return status === "missing" && candidateCount > 0 ? "ambiguous" : status;
}

export function resolveAppliedAiStatus(params: {
  existingStatus: InvoiceImportDraftRow["suggestionStatus"];
  aiStatus: "clear" | "ambiguous" | "missing";
  aiSelectedArticleCode: string | null;
  alternativeArticleCodes: string[];
  currentSelectedArticleCode: string | null;
  topCandidateCode: string | null;
}): "clear" | "ambiguous" | "missing" {
  const keepClearHeuristicSelection =
    params.existingStatus === "clear" &&
    params.aiStatus === "ambiguous" &&
    params.aiSelectedArticleCode &&
    params.alternativeArticleCodes.length === 0 &&
    params.currentSelectedArticleCode === params.aiSelectedArticleCode &&
    params.topCandidateCode === params.aiSelectedArticleCode;

  return keepClearHeuristicSelection ? "clear" : params.aiStatus;
}

export function resolveAppliedAiSelection(params: {
  existingStatus: InvoiceImportDraftRow["suggestionStatus"];
  aiStatus: "clear" | "ambiguous" | "missing";
  aiSelectedArticleCode: string | null;
  alternativeArticleCodes: string[];
  currentSelectedArticleCode: string | null;
  topCandidateCode: string | null;
  candidates: InvoiceImportReviewArticleCandidate[];
}): {
  selectedCandidate: InvoiceImportReviewArticleCandidate | null;
  suggestionStatus: InvoiceImportDraftRow["suggestionStatus"];
} {
  const appliedStatus = resolveAppliedAiStatus({
    existingStatus: params.existingStatus,
    aiStatus: params.aiStatus,
    aiSelectedArticleCode: params.aiSelectedArticleCode,
    alternativeArticleCodes: params.alternativeArticleCodes,
    currentSelectedArticleCode: params.currentSelectedArticleCode,
    topCandidateCode: params.topCandidateCode,
  });

  return {
    selectedCandidate: selectAiCandidate(appliedStatus, params.candidates),
    suggestionStatus: resolveAiSuggestionStatus(
      appliedStatus,
      params.candidates.length,
    ),
  };
}

export function applyAiSelectionToRow(params: {
  row: InvoiceImportDraftRow;
  selectedCandidate: InvoiceImportReviewArticleCandidate | null;
  mergedCandidates: InvoiceImportReviewArticleCandidate[];
  suggestionStatus: InvoiceImportDraftRow["suggestionStatus"];
  reason: string;
}): InvoiceImportDraftRow {
  return {
    ...params.row,
    selectedArticleCode: params.selectedCandidate?.code ?? null,
    selectedArticleDescription: params.selectedCandidate?.description ?? null,
    unit: params.selectedCandidate?.unit ?? params.row.unit,
    accountCode:
      params.selectedCandidate?.purchaseAccountCode ?? params.row.accountCode,
    taxCode: params.selectedCandidate?.taxCode ?? params.row.taxCode,
    articleCandidates: params.mergedCandidates,
    suggestionStatus: params.suggestionStatus,
    articleSuggestionReason:
      params.reason.trim() || "Matched the invoice row to this article.",
  };
}
