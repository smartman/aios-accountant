import { InvoiceImportReviewArticleCandidate } from "../invoice-import-types";

function formatCandidateLabel(
  candidate: InvoiceImportReviewArticleCandidate,
): string {
  return candidate.description?.trim()
    ? `${candidate.code} - ${candidate.description}`
    : candidate.code;
}

export function buildArticleSuggestionReason(
  candidates: InvoiceImportReviewArticleCandidate[],
): string {
  const top = candidates[0];
  const runnerUp = candidates[1];

  if (!top) {
    return "No existing article matched the row description, metadata, or vendor history strongly enough.";
  }

  const topReason =
    top.reasons[0]?.trim() ||
    "The best candidate only matched on weak supporting signals.";

  if (!runnerUp) {
    return top.score >= 30
      ? topReason
      : `${topReason} The match was too weak to auto-select automatically.`;
  }

  if (top.score >= 30 && top.score - runnerUp.score >= 10) {
    return topReason;
  }

  return `${topReason} ${formatCandidateLabel(top)} and ${formatCandidateLabel(runnerUp)} were too close to choose automatically.`;
}
