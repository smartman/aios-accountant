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

  if (row.newArticle.unit.trim()) {
    units.add(row.newArticle.unit.trim());
  }

  units.add("pcs");

  return [...units].sort((left, right) => left.localeCompare(right));
}

function RowHeader({ draft, row, setDraft }: Omit<RowEditorProps, "preview">) {
  const canRemoveRow = draft.rows.length > 1;

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <strong className="text-base text-slate-900 dark:text-slate-100">
          {formatInvoiceImportRowLabel(row.id)}
        </strong>
        <span className={statusChipClass(row.suggestionStatus)}>
          {row.suggestionStatus}
        </span>
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
    <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm md:col-span-12">
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
  row,
  setDraft,
  value,
  onValueChange,
}: {
  draft: InvoiceImportDraft;
  label: string;
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
      <span className={rowFieldLabelClass}>{label}</span>
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

  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-12">
      <DescriptionField draft={draft} row={row} setDraft={setDraft} />
      <div className="md:col-span-3">
        <NumericField
          draft={draft}
          label="Quantity"
          row={row}
          setDraft={setDraft}
          value={row.quantity}
          onValueChange={(current, value) => ({
            ...current,
            quantity: value ?? 0,
          })}
        />
      </div>
      <div className="md:col-span-3">
        <UnitDropdown
          allowEmpty={!lockedArticleUnit}
          disabled={Boolean(
            row.articleDecision === "existing" && lockedArticleUnit,
          )}
          label="Unit"
          options={lockedArticleUnit ? [lockedArticleUnit] : unitOptions}
          placeholder="No unit"
          value={lockedArticleUnit ?? row.unit}
          onChange={(value) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              unit: value,
              newArticle: {
                ...current.newArticle,
                unit: value ?? current.newArticle.unit,
              },
            }))
          }
        />
      </div>
      <div className="md:col-span-3">
        <NumericField
          draft={draft}
          label="Price"
          row={row}
          setDraft={setDraft}
          value={row.price}
          onValueChange={(current, value) => ({
            ...current,
            price: value,
          })}
        />
      </div>
      <div className="md:col-span-3">
        <NumericField
          draft={draft}
          label="Net row amount"
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
  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-[0.45rem] text-sm">
        <span className={rowFieldLabelClass}>Purchase account</span>
        <select
          className={fieldClass()}
          value={row.accountCode}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              accountCode: event.target.value,
              newArticle: {
                ...current.newArticle,
                purchaseAccountCode: event.target.value,
              },
            }))
          }
        >
          <option value="">Select account</option>
          {preview.referenceData.accounts.map((account) => (
            <option key={account.code} value={account.code}>
              {account.label}
            </option>
          ))}
        </select>
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
              newArticle: {
                ...current.newArticle,
                taxCode: event.target.value || null,
              },
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

function AccountReason({ reason }: { reason: string }) {
  return (
    <details className="rounded-[14px] border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
      <summary className="cursor-pointer list-none font-medium">
        Why this account?
      </summary>
      <p className="mt-2 m-0 leading-6">{reason}</p>
    </details>
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
      <AccountReason reason={props.row.accountSelectionReason} />
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
