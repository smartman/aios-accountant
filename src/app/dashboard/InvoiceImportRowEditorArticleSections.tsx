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

function buildUnitOptions(
  row: InvoiceImportDraftRow,
  preview: InvoiceImportPreviewResult,
): string[] {
  const units = new Set<string>();

  for (const unit of preview.unitOptions ?? []) {
    if (unit.trim()) {
      units.add(unit.trim());
    }
  }

  for (const article of preview.articleOptions ?? []) {
    if (article.unit?.trim()) {
      units.add(article.unit.trim());
    }
  }

  if (row.unit?.trim()) {
    units.add(row.unit.trim());
  }

  if (row.newArticle.unit.trim()) {
    units.add(row.newArticle.unit.trim());
  }

  units.add("pcs");

  return [...units].sort((left, right) => left.localeCompare(right));
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
    articleDecision: "existing",
    selectedArticleCode: selectedCode || null,
    selectedArticleDescription:
      selectedCandidate?.description ?? selectedArticle?.description ?? null,
    articleCandidates: mergedCandidates,
    unit: selectedUnit ?? current.unit,
    accountCode: selectedPurchaseAccountCode ?? current.accountCode,
    newArticle: {
      ...current.newArticle,
      purchaseAccountCode:
        selectedPurchaseAccountCode ?? current.newArticle.purchaseAccountCode,
    },
  }));
}

function ArticleModeToggle({
  activeMode,
  onChange,
}: {
  activeMode: InvoiceImportDraftRow["articleDecision"];
  onChange: (mode: InvoiceImportDraftRow["articleDecision"]) => void;
}) {
  const modeButtonClass = (mode: InvoiceImportDraftRow["articleDecision"]) =>
    [
      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
      activeMode === mode
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
    ].join(" ");

  return (
    <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
      <button
        className={modeButtonClass("existing")}
        type="button"
        onClick={() => onChange("existing")}
      >
        Use existing
      </button>
      <button
        className={modeButtonClass("create")}
        type="button"
        onClick={() => onChange("create")}
      >
        Create new
      </button>
    </div>
  );
}

function ArticleStatusCopy({ row }: { row: InvoiceImportDraftRow }) {
  if (row.suggestionStatus === "clear" && row.selectedArticleCode) {
    return (
      <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
        Auto-selected the closest existing article. You can change it.
      </p>
    );
  }

  if (row.suggestionStatus === "ambiguous") {
    return (
      <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
        Several similar articles were found. Pick one manually or create a new
        article.
      </p>
    );
  }

  return (
    <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
      No reliable article match was found. Choose an existing article or create
      a new one.
    </p>
  );
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
      {row.articleCandidates.length ? (
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
          Suggested matches are listed first for quick override.
        </p>
      ) : null}
    </div>
  );
}

export function UnitDropdown({
  allowEmpty = false,
  disabled = false,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  allowEmpty?: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: string | null) => void;
  options: string[];
  placeholder: string;
  value: string | null;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
      <span className={rowArticleLabelClass}>{label}</span>
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

function NewArticleFields({
  draft,
  preview,
  row,
  setDraft,
}: ArticleSectionProps) {
  const articleTypeOptions = Array.from(
    new Set(
      [
        ...(preview.articleTypeOptions ?? ["SERVICE"]),
        row.newArticle.type,
      ].filter(Boolean),
    ),
  );
  const unitOptions = buildUnitOptions(row, preview);

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-4">
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className={rowArticleLabelClass}>New article code</span>
        <input
          className={fieldClass()}
          value={row.newArticle.code}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              articleDecision: "create",
              newArticle: {
                ...current.newArticle,
                code: event.target.value,
              },
            }))
          }
        />
      </label>
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm lg:col-span-2">
        <span className={rowArticleLabelClass}>New article description</span>
        <input
          className={fieldClass()}
          value={row.newArticle.description}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              articleDecision: "create",
              newArticle: {
                ...current.newArticle,
                description: event.target.value,
              },
            }))
          }
        />
      </label>
      <UnitDropdown
        allowEmpty
        label="New article unit"
        options={unitOptions}
        placeholder="No unit"
        value={row.newArticle.unit}
        onChange={(value) =>
          updateDraftRow(draft, row.id, setDraft, (current) => ({
            ...current,
            articleDecision: "create",
            newArticle: {
              ...current.newArticle,
              unit: value ?? "",
            },
          }))
        }
      />
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className={rowArticleLabelClass}>New article type</span>
        <select
          className={fieldClass()}
          value={row.newArticle.type}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              articleDecision: "create",
              newArticle: {
                ...current.newArticle,
                type: event.target.value,
              },
            }))
          }
        >
          {articleTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ArticleMatchSection({
  draft,
  preview,
  row,
  setDraft,
}: ArticleSectionProps) {
  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Article match
            </span>
            <span className={statusChipClass(row.suggestionStatus)}>
              {row.suggestionStatus}
            </span>
          </div>
          <ArticleStatusCopy row={row} />
        </div>
        {row.sourceArticleCode ? (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            Source code: {row.sourceArticleCode}
          </span>
        ) : null}
      </div>

      <ArticleModeToggle
        activeMode={row.articleDecision}
        onChange={(mode) =>
          updateDraftRow(draft, row.id, setDraft, (current) => ({
            ...current,
            articleDecision: mode,
          }))
        }
      />

      {row.articleDecision === "create" ? (
        <NewArticleFields
          draft={draft}
          preview={preview}
          row={row}
          setDraft={setDraft}
        />
      ) : (
        <ExistingArticleFields
          draft={draft}
          preview={preview}
          row={row}
          setDraft={setDraft}
        />
      )}
    </section>
  );
}
