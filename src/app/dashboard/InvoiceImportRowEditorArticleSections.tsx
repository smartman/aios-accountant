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
