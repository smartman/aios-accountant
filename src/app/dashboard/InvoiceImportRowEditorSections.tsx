"use client";

import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import { formatInvoiceImportRowLabel } from "@/lib/invoice-import/row-label";
import {
  compactFieldLabelClass,
  fieldClass,
  statusChipClass,
  updateRow,
} from "./InvoiceImportReviewShared";
import {
  ArticleMatchSection,
  UnitDropdown,
} from "./InvoiceImportRowEditorArticleSections";
import { SearchableSelectField } from "./SearchableSelectField";

const rowFieldLabelClass = compactFieldLabelClass;

export interface RowEditorProps {
  draft: InvoiceImportDraft;
  row: InvoiceImportDraftRow;
  preview: InvoiceImportPreviewResult;
  setDraft: (draft: InvoiceImportDraft) => void;
}

export function updateDraftRow(
  draft: InvoiceImportDraft,
  rowId: string,
  setDraft: (draft: InvoiceImportDraft) => void,
  updater: (row: InvoiceImportDraftRow) => InvoiceImportDraftRow,
) {
  setDraft(updateRow(draft, rowId, updater));
}

function buildRowUnitOptions(
  row: InvoiceImportDraftRow,
  preview: InvoiceImportPreviewResult,
): string[] {
  const units = new Set<string>();

  for (const unit of preview.unitOptions ?? []) {
    if (unit.trim()) {
      units.add(unit.trim());
    }
  }

  if (row.unit?.trim()) {
    units.add(row.unit.trim());
  }

  units.add("pcs");

  return [...units].sort((left, right) => left.localeCompare(right));
}

function RowHeader({ draft, row, setDraft }: Omit<RowEditorProps, "preview">) {
  const canRemoveRow = draft.rows.length > 1;
  const showStatusChip = row.suggestionStatus !== "clear";

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <strong className="text-base text-slate-900 dark:text-slate-100">
          {formatInvoiceImportRowLabel(row.id)}
        </strong>
        {showStatusChip ? (
          <span className={statusChipClass(row.suggestionStatus)}>
            {row.suggestionStatus}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="mt-px h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={row.reviewed}
            onChange={(event) =>
              updateDraftRow(draft, row.id, setDraft, (current) => ({
                ...current,
                reviewed: event.target.checked,
              }))
            }
          />
          <span>Reviewed</span>
        </label>
        <button
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          type="button"
          disabled={!canRemoveRow}
          title={
            canRemoveRow ? "Remove this row" : "At least one row is required"
          }
          onClick={() =>
            canRemoveRow
              ? setDraft({
                  ...draft,
                  rows: draft.rows.filter((draftRow) => draftRow.id !== row.id),
                })
              : undefined
          }
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function DescriptionField({
  draft,
  row,
  setDraft,
}: Omit<RowEditorProps, "preview">) {
  return (
    <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm sm:col-span-2 xl:col-span-4">
      <span className={rowFieldLabelClass}>Description</span>
      <input
        className={fieldClass()}
        value={row.description}
        onChange={(event) =>
          updateDraftRow(draft, row.id, setDraft, (current) => ({
            ...current,
            description: event.target.value,
          }))
        }
      />
    </label>
  );
}

function NumericField({
  draft,
  label,
  labelClassName = rowFieldLabelClass,
  row,
  setDraft,
  value,
  onValueChange,
}: {
  draft: InvoiceImportDraft;
  label: string;
  labelClassName?: string;
  row: InvoiceImportDraftRow;
  setDraft: (draft: InvoiceImportDraft) => void;
  value: number | null;
  onValueChange: (
    current: InvoiceImportDraftRow,
    value: number | null,
  ) => InvoiceImportDraftRow;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
      <span className={labelClassName}>{label}</span>
      <input
        type="number"
        className={fieldClass()}
        value={value ?? ""}
        onChange={(event) =>
          updateDraftRow(draft, row.id, setDraft, (current) =>
            onValueChange(
              current,
              event.target.value ? Number(event.target.value) : null,
            ),
          )
        }
      />
    </label>
  );
}

function RowValueFields({ draft, row, preview, setDraft }: RowEditorProps) {
  const unitOptions = buildRowUnitOptions(row, preview);
  const selectedArticle = row.selectedArticleCode
    ? (row.articleCandidates.find(
        (candidate) => candidate.code === row.selectedArticleCode,
      ) ?? null)
    : null;
  const lockedArticleUnit = selectedArticle?.unit?.trim() || null;
  const rowMetricLabelClass =
    "flex min-h-[2.5rem] items-end text-sm leading-5 text-slate-600 whitespace-normal text-pretty dark:text-slate-400";

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DescriptionField draft={draft} row={row} setDraft={setDraft} />
      <div className="min-w-0">
        <NumericField
          draft={draft}
          label="Quantity"
          labelClassName={rowMetricLabelClass}
          row={row}
          setDraft={setDraft}
          value={row.quantity}
          onValueChange={(current, value) => ({
            ...current,
            quantity: value ?? 0,
          })}
        />
      </div>
      <div className="min-w-0">
        <UnitDropdown
          allowEmpty={!lockedArticleUnit}
          disabled={Boolean(lockedArticleUnit)}
          label="Unit"
          labelClassName={rowMetricLabelClass}
          options={lockedArticleUnit ? [lockedArticleUnit] : unitOptions}
          placeholder="No unit"
          value={lockedArticleUnit ?? row.unit}
          onChange={(value) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              unit: value,
            }))
          }
        />
      </div>
      <div className="min-w-0">
        <NumericField
          draft={draft}
          label="Price"
          labelClassName={rowMetricLabelClass}
          row={row}
          setDraft={setDraft}
          value={row.price}
          onValueChange={(current, value) => ({
            ...current,
            price: value,
          })}
        />
      </div>
      <div className="min-w-0">
        <NumericField
          draft={draft}
          label="Net row amount"
          labelClassName={rowMetricLabelClass}
          row={row}
          setDraft={setDraft}
          value={row.sum}
          onValueChange={(current, value) => ({
            ...current,
            sum: value,
          })}
        />
      </div>
    </div>
  );
}

function RowAccountingFields({
  draft,
  row,
  preview,
  setDraft,
}: RowEditorProps) {
  const purchaseAccountOptions = preview.referenceData.accounts.map((account) => ({
    label: account.label,
    searchText: `${account.code} ${account.label}`,
    value: account.code,
  }));

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className="flex items-center gap-2">
          <span className={rowFieldLabelClass}>Purchase account</span>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold leading-none text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
            aria-label={`Why this account? ${row.accountSelectionReason}`}
            title={row.accountSelectionReason}
          >
            i
          </button>
        </span>
        <SearchableSelectField
          options={purchaseAccountOptions}
          placeholder="Select account"
          searchAriaLabel="Search purchase accounts"
          searchPlaceholder="Type to filter accounts by code or name"
          value={row.accountCode}
          onChange={(value) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              accountCode: value,
            }))
          }
        />
      </label>
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className={rowFieldLabelClass}>VAT code</span>
        <select
          className={fieldClass()}
          value={row.taxCode ?? ""}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              taxCode: event.target.value || null,
            }))
          }
        >
          <option value="">No VAT code</option>
          {preview.referenceData.taxCodes.map((taxCode) => (
            <option key={taxCode.code} value={taxCode.code}>
              {taxCode.description}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function RowBasics(props: RowEditorProps) {
  return (
    <div className="flex flex-col gap-4">
      <ArticleMatchSection
        draft={props.draft}
        preview={props.preview}
        row={props.row}
        setDraft={props.setDraft}
      />
      <RowValueFields
        draft={props.draft}
        preview={props.preview}
        row={props.row}
        setDraft={props.setDraft}
      />
      <RowAccountingFields
        draft={props.draft}
        row={props.row}
        preview={props.preview}
        setDraft={props.setDraft}
      />
    </div>
  );
}

export function InvoiceImportRowEditorBody(props: RowEditorProps) {
  return (
    <>
      <RowHeader
        draft={props.draft}
        row={props.row}
        setDraft={props.setDraft}
      />
      <RowBasics {...props} />
    </>
  );
}
