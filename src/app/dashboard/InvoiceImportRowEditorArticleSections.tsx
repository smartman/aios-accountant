"use client";

import {
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  compactFieldLabelClass,
  fieldClass,
  statusChipClass,
} from "./InvoiceImportReviewShared";
import {
  RowEditorProps,
  updateDraftRow,
} from "./InvoiceImportRowEditorSections";
import {
  SearchableSelectField,
  type SearchableSelectOption,
} from "./SearchableSelectField";

const rowArticleLabelClass = compactFieldLabelClass;

type RowSectionProps = Pick<RowEditorProps, "draft" | "row" | "setDraft">;
type ArticleSectionProps = RowSectionProps & Pick<RowEditorProps, "preview">;
type ArticleOption = NonNullable<
  InvoiceImportPreviewResult["articleOptions"]
>[number];

function formatArticleOptionLabel(article: ArticleOption) {
  return `${article.code} - ${article.description ?? "No description"}`;
}

function buildSuggestedArticleOptions(
  row: InvoiceImportDraftRow,
  articleOptions: ArticleOption[],
): ArticleOption[] {
  const articleByCode = new Map(
    articleOptions.map((article) => [article.code, article] as const),
  );

  return row.articleCandidates
    .map(
      (candidate) =>
        articleByCode.get(candidate.code) ?? {
          code: candidate.code,
          description: candidate.description,
          unit: candidate.unit,
          purchaseAccountCode: candidate.purchaseAccountCode,
          taxCode: candidate.taxCode,
          type: candidate.type,
        },
    )
    .filter(
      (article, index, all) =>
        all.findIndex((entry) => entry.code === article.code) === index,
    );
}

function buildRemainingArticleOptions(
  suggestedOptions: ArticleOption[],
  articleOptions: ArticleOption[],
): ArticleOption[] {
  const suggestedCodes = new Set(
    suggestedOptions.map((article) => article.code),
  );

  return articleOptions.filter((article) => !suggestedCodes.has(article.code));
}

function toArticleCandidate(article: ArticleOption) {
  return {
    code: article.code,
    description: article.description ?? article.code,
    unit: article.unit ?? null,
    purchaseAccountCode: article.purchaseAccountCode ?? null,
    taxCode: article.taxCode ?? null,
    type: article.type ?? null,
    score: 0,
    reasons: [],
    historyMatches: 0,
    recentInvoiceDate: null,
  };
}

function toSearchableArticleOption(
  article: ArticleOption,
): SearchableSelectOption {
  return {
    label: formatArticleOptionLabel(article),
    searchText: [
      article.code,
      article.description ?? "",
      article.unit ?? "",
      article.purchaseAccountCode ?? "",
      article.taxCode ?? "",
    ].join(" "),
    value: article.code,
  };
}

function mergeArticleCandidates(
  row: InvoiceImportDraftRow,
  selectedArticle: ArticleOption | undefined,
) {
  if (!selectedArticle) {
    return row.articleCandidates;
  }

  return [...row.articleCandidates, toArticleCandidate(selectedArticle)].filter(
    (candidate, index, all) =>
      all.findIndex((entry) => entry.code === candidate.code) === index,
  );
}

function formatCandidateLabel(
  candidate: InvoiceImportDraftRow["articleCandidates"][number],
) {
  return candidate.description?.trim()
    ? `${candidate.code} - ${candidate.description}`
    : candidate.code;
}

function stripAiReasonPrefix(reason: string): string {
  return reason.replace(/^AI article matcher:\s*/u, "").trim();
}

function buildArticleSuggestionTooltip(
  row: InvoiceImportDraftRow,
): string | null {
  const explicitReason = row.articleSuggestionReason?.trim();

  if (explicitReason) {
    return explicitReason;
  }

  const topCandidate = row.articleCandidates[0];
  const runnerUp = row.articleCandidates[1];
  const topReason = stripAiReasonPrefix(topCandidate?.reasons[0] ?? "");

  if (row.suggestionStatus === "missing") {
    return (
      topReason ||
      "No existing article matched the row description strongly enough."
    );
  }

  if (!topCandidate) {
    return "No existing article matched the row description strongly enough.";
  }

  if (!runnerUp) {
    return (
      topReason ||
      "A possible article was found, but the match was too weak to auto-select automatically."
    );
  }

  return `${topReason || "More than one article remained plausible."} Competing matches: ${formatCandidateLabel(topCandidate)} and ${formatCandidateLabel(runnerUp)}.`;
}

function ArticleSuggestionTooltip({ row }: { row: InvoiceImportDraftRow }) {
  const tooltipId = `row-article-reason-${row.id}`;
  const tooltipText = buildArticleSuggestionTooltip(row);

  if (!tooltipText || row.suggestionStatus === "clear") {
    return null;
  }

  return (
    <span className="group/tooltip relative inline-flex">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold leading-none text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
        aria-describedby={tooltipId}
        aria-label={`Why is the article match ${row.suggestionStatus}? ${tooltipText}`}
      >
        i
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-20 w-64 -translate-x-1/2 rounded-[12px] bg-slate-900 px-3 py-2 text-xs leading-5 text-white opacity-0 shadow-[0_14px_30px_rgba(15,23,42,0.2)] transition duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 dark:bg-slate-700"
      >
        {tooltipText}
      </span>
    </span>
  );
}

function updateArticleSelection(
  props: RowSectionProps,
  selectedCode: string,
  preview: InvoiceImportPreviewResult,
) {
  const selectedCandidate = props.row.articleCandidates.find(
    (candidate) => candidate.code === selectedCode,
  );
  const selectedArticle = (preview.articleOptions ?? []).find(
    (article) => article.code === selectedCode,
  );
  const selectedUnit = selectedCandidate?.unit ?? selectedArticle?.unit ?? null;
  const selectedPurchaseAccountCode =
    selectedCandidate?.purchaseAccountCode ??
    selectedArticle?.purchaseAccountCode ??
    null;
  const mergedCandidates = selectedCode
    ? mergeArticleCandidates(props.row, selectedArticle)
    : props.row.articleCandidates;

  updateDraftRow(props.draft, props.row.id, props.setDraft, (current) => ({
    ...current,
    selectedArticleCode: selectedCode || null,
    selectedArticleDescription:
      selectedCandidate?.description ?? selectedArticle?.description ?? null,
    articleCandidates: mergedCandidates,
    unit: current.unit?.trim() ? current.unit : (selectedUnit ?? null),
    accountCode: selectedPurchaseAccountCode ?? current.accountCode,
  }));
}

function ArticleStatusCopy({ row }: { row: InvoiceImportDraftRow }) {
  if (row.suggestionStatus === "ambiguous") {
    if (row.articleCandidates.length <= 1) {
      return (
        <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
          A possible article match was found, but the confidence was too low to
          auto-select it. Choose the correct article manually.
        </p>
      );
    }

    return (
      <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
        Several similar articles were found. Choose the correct article
        manually.
      </p>
    );
  }

  if (row.suggestionStatus === "missing") {
    return (
      <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
        Article not detected, choose manually or create new article and refresh
        the article cache.
      </p>
    );
  }

  return null;
}

function ExistingArticleFields({
  draft,
  preview,
  row,
  setDraft,
}: ArticleSectionProps) {
  const articleOptions = preview.articleOptions ?? [];
  const suggestedOptions = buildSuggestedArticleOptions(row, articleOptions);
  const remainingOptions = buildRemainingArticleOptions(
    suggestedOptions,
    articleOptions,
  );
  const searchableOptions = [...suggestedOptions, ...remainingOptions].map(
    toSearchableArticleOption,
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className="sr-only">Accounting article/item</span>
        <SearchableSelectField
          options={searchableOptions}
          placeholder="Select accounting article"
          searchAriaLabel="Search accounting articles"
          value={row.selectedArticleCode ?? ""}
          onChange={(value) =>
            updateArticleSelection({ draft, row, setDraft }, value, preview)
          }
        />
      </label>
    </div>
  );
}

export function UnitDropdown({
  allowEmpty = false,
  disabled = false,
  label,
  labelClassName = rowArticleLabelClass,
  onChange,
  options,
  placeholder,
  value,
}: {
  allowEmpty?: boolean;
  disabled?: boolean;
  label: string;
  labelClassName?: string;
  onChange: (value: string | null) => void;
  options: string[];
  placeholder: string;
  value: string | null;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
      <span className={labelClassName}>{label}</span>
      <select
        className={fieldClass()}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {options.map((option, index) => (
          <option key={`${option}-${index}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ArticleMatchSection({
  draft,
  preview,
  row,
  setDraft,
}: ArticleSectionProps) {
  const showStatusChip = row.suggestionStatus !== "clear";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={rowArticleLabelClass}>Article</span>
            {showStatusChip ? (
              <span className={statusChipClass(row.suggestionStatus)}>
                {row.suggestionStatus}
              </span>
            ) : null}
            <ArticleSuggestionTooltip row={row} />
          </div>
          <ArticleStatusCopy row={row} />
        </div>
        {row.sourceArticleCode ? (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            Source code: {row.sourceArticleCode}
          </span>
        ) : null}
      </div>
      <ExistingArticleFields
        draft={draft}
        preview={preview}
        row={row}
        setDraft={setDraft}
      />
    </section>
  );
}
