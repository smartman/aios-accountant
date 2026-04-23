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
    unit: selectedUnit ?? current.unit,
    accountCode: selectedPurchaseAccountCode ?? current.accountCode,
  }));
}

function ArticleStatusCopy({ row }: { row: InvoiceImportDraftRow }) {
  if (row.suggestionStatus === "ambiguous") {
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

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className={rowArticleLabelClass}>Accounting article/item</span>
        <select
          className={fieldClass()}
          value={row.selectedArticleCode ?? ""}
          onChange={(event) =>
            updateArticleSelection(
              { draft, row, setDraft },
              event.target.value,
              preview,
            )
          }
        >
          <option value="">Select accounting article</option>
          {suggestedOptions.length ? (
            <optgroup label="Suggested matches">
              {suggestedOptions.map((article) => (
                <option key={article.code} value={article.code}>
                  {formatArticleOptionLabel(article)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {remainingOptions.length ? (
            <optgroup
              label={
                suggestedOptions.length ? "All articles" : "Available articles"
              }
            >
              {remainingOptions.map((article) => (
                <option key={article.code} value={article.code}>
                  {formatArticleOptionLabel(article)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
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
        {options.map((option) => (
          <option key={option} value={option}>
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
    <section className="flex flex-col gap-4 rounded-[16px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Article match
            </span>
            {showStatusChip ? (
              <span className={statusChipClass(row.suggestionStatus)}>
                {row.suggestionStatus}
              </span>
            ) : null}
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
