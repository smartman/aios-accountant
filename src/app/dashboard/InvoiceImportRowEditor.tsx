"use client";

import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import { fieldStyle, updateRow } from "./InvoiceImportReviewShared";

interface RowEditorProps {
  draft: InvoiceImportDraft;
  row: InvoiceImportDraftRow;
  preview: InvoiceImportPreviewResult;
  setDraft: (draft: InvoiceImportDraft) => void;
}

function updateDraftRow(
  draft: InvoiceImportDraft,
  rowId: string,
  setDraft: (draft: InvoiceImportDraft) => void,
  updater: (row: InvoiceImportDraftRow) => InvoiceImportDraftRow,
) {
  setDraft(updateRow(draft, rowId, updater));
}

function RowHeader({ draft, row, setDraft }: Omit<RowEditorProps, "preview">) {
  const canRemoveRow = draft.rows.length > 1;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
        marginBottom: "1rem",
      }}
    >
      <div>
        <strong>{row.id}</strong>
        <p
          style={{
            margin: "0.35rem 0 0",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
          }}
        >
          {row.accountSelectionReason}
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <span className={`status-chip ${row.suggestionStatus}`}>
          {row.suggestionStatus}
        </span>
        <label className="checkbox-line">
          <input
            type="checkbox"
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
          className="btn btn-secondary"
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

function RowValueFields({
  draft,
  row,
  setDraft,
}: Omit<RowEditorProps, "preview">) {
  return (
    <>
      <label>
        <span>Source article code</span>
        <input
          style={fieldStyle()}
          value={row.sourceArticleCode ?? ""}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              sourceArticleCode: event.target.value || null,
            }))
          }
        />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span>Description</span>
        <input
          style={fieldStyle()}
          value={row.description}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </label>
      <label>
        <span>Quantity</span>
        <input
          type="number"
          style={fieldStyle()}
          value={row.quantity}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              quantity: Number(event.target.value || 0),
            }))
          }
        />
      </label>
      <label>
        <span>Unit</span>
        <input
          style={fieldStyle()}
          value={row.unit ?? ""}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              unit: event.target.value || null,
            }))
          }
        />
      </label>
      <label>
        <span>Price</span>
        <input
          type="number"
          style={fieldStyle()}
          value={row.price ?? ""}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              price: event.target.value ? Number(event.target.value) : null,
            }))
          }
        />
      </label>
      <label>
        <span>Net row amount</span>
        <input
          type="number"
          style={fieldStyle()}
          value={row.sum ?? ""}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              sum: event.target.value ? Number(event.target.value) : null,
            }))
          }
        />
      </label>
    </>
  );
}

function RowAccountingFields({
  draft,
  row,
  preview,
  setDraft,
}: RowEditorProps) {
  return (
    <>
      <label>
        <span>Purchase account</span>
        <select
          style={fieldStyle()}
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
      <label>
        <span>VAT code</span>
        <select
          style={fieldStyle()}
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
    </>
  );
}

function RowBasics(props: RowEditorProps) {
  return (
    <div className="field-grid">
      <RowValueFields
        draft={props.draft}
        row={props.row}
        setDraft={props.setDraft}
      />
      <RowAccountingFields {...props} />
    </div>
  );
}

function ExistingArticleSection({
  draft,
  row,
  setDraft,
}: Pick<RowEditorProps, "draft" | "row" | "setDraft">) {
  return (
    <div style={{ marginTop: "1rem" }}>
      <label>
        <span>Suggested article/item</span>
        <select
          style={fieldStyle()}
          value={row.selectedArticleCode ?? ""}
          onChange={(event) => {
            const selected = row.articleCandidates.find(
              (candidate) => candidate.code === event.target.value,
            );
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              selectedArticleCode: selected?.code ?? null,
              selectedArticleDescription: selected?.description ?? null,
            }));
          }}
        >
          <option value="">Choose accounting article/item</option>
          {row.articleCandidates.map((candidate) => (
            <option key={candidate.code} value={candidate.code}>
              {candidate.code} - {candidate.description}
            </option>
          ))}
        </select>
      </label>
      {row.articleCandidates.length ? (
        <div className="candidate-list">
          {row.articleCandidates.map((candidate) => (
            <div key={`${row.id}-${candidate.code}`} className="candidate-card">
              <strong>
                {candidate.code} - {candidate.description}
              </strong>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                Score {candidate.score} · History {candidate.historyMatches}
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                {candidate.reasons.join(" ")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NewArticleSection({
  draft,
  row,
  setDraft,
}: Pick<RowEditorProps, "draft" | "row" | "setDraft">) {
  return (
    <div className="field-grid" style={{ marginTop: "1rem" }}>
      <label>
        <span>New article code</span>
        <input
          style={fieldStyle()}
          value={row.newArticle.code}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              newArticle: {
                ...current.newArticle,
                code: event.target.value,
              },
            }))
          }
        />
      </label>
      <label>
        <span>New article description</span>
        <input
          style={fieldStyle()}
          value={row.newArticle.description}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              newArticle: {
                ...current.newArticle,
                description: event.target.value,
              },
            }))
          }
        />
      </label>
      <label>
        <span>New article unit</span>
        <input
          style={fieldStyle()}
          value={row.newArticle.unit}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              newArticle: {
                ...current.newArticle,
                unit: event.target.value,
              },
            }))
          }
        />
      </label>
      <label>
        <span>New article type</span>
        <input
          style={fieldStyle()}
          value={row.newArticle.type}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              newArticle: {
                ...current.newArticle,
                type: event.target.value,
              },
            }))
          }
        />
      </label>
    </div>
  );
}

function ArticleDecisionSection({
  draft,
  row,
  setDraft,
}: Pick<RowEditorProps, "draft" | "row" | "setDraft">) {
  return (
    <div style={{ marginTop: "1rem" }}>
      <label>
        <span>Article decision</span>
        <select
          style={fieldStyle()}
          value={row.articleDecision}
          onChange={(event) =>
            updateDraftRow(draft, row.id, setDraft, (current) => ({
              ...current,
              articleDecision: event.target.value as "existing" | "create",
            }))
          }
        >
          <option value="existing">Use existing accounting article/item</option>
          <option value="create">Create new accounting article/item</option>
        </select>
      </label>

      {row.articleDecision === "existing" ? (
        <ExistingArticleSection draft={draft} row={row} setDraft={setDraft} />
      ) : (
        <NewArticleSection draft={draft} row={row} setDraft={setDraft} />
      )}
    </div>
  );
}

export default function InvoiceImportRowEditor(props: RowEditorProps) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "1.25rem",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <RowHeader
        draft={props.draft}
        row={props.row}
        setDraft={props.setDraft}
      />
      <RowBasics {...props} />
      <ArticleDecisionSection
        draft={props.draft}
        row={props.row}
        setDraft={props.setDraft}
      />
    </div>
  );
}
