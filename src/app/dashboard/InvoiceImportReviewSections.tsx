import {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  createBlankRow,
  fieldStyle,
  sectionTitle,
} from "./InvoiceImportReviewShared";
import InvoiceImportRowEditor from "./InvoiceImportRowEditor";

export function VendorSection({
  draft,
  setDraft,
}: {
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  const existingVendorLabel =
    draft.vendor.existingVendorName ?? draft.vendor.existingVendorId;

  return (
    <section>
      {sectionTitle("Vendor")}
      <div className="field-grid">
        <label>
          <span>Name</span>
          <input
            style={fieldStyle()}
            value={draft.vendor.name}
            onChange={(event) =>
              setDraft({
                ...draft,
                vendor: { ...draft.vendor, name: event.target.value },
              })
            }
          />
        </label>
        <label>
          <span>Registry code</span>
          <input
            style={fieldStyle()}
            value={draft.vendor.regCode ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                vendor: {
                  ...draft.vendor,
                  regCode: event.target.value || null,
                },
              })
            }
          />
        </label>
        <label>
          <span>VAT number</span>
          <input
            style={fieldStyle()}
            value={draft.vendor.vatNumber ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                vendor: {
                  ...draft.vendor,
                  vatNumber: event.target.value || null,
                },
              })
            }
          />
        </label>
        <label>
          <span>Vendor handling</span>
          <select
            style={fieldStyle()}
            value={draft.vendor.selectionMode}
            onChange={(event) =>
              setDraft({
                ...draft,
                actions: {
                  ...draft.actions,
                  createVendor: event.target.value === "create",
                },
                vendor: {
                  ...draft.vendor,
                  selectionMode: event.target.value as "existing" | "create",
                },
              })
            }
          >
            {draft.vendor.existingVendorId ? (
              <option value="existing">
                Use existing vendor ({existingVendorLabel})
              </option>
            ) : null}
            <option value="create">Create vendor on confirm</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function InvoiceIdentityFields({
  draft,
  setDraft,
}: {
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <>
      <label>
        <span>Invoice number</span>
        <input
          style={fieldStyle()}
          value={draft.invoice.invoiceNumber}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                invoiceNumber: event.target.value,
              },
            })
          }
        />
      </label>
      <label>
        <span>Issue date</span>
        <input
          type="date"
          style={fieldStyle()}
          value={draft.invoice.issueDate}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                issueDate: event.target.value,
              },
            })
          }
        />
      </label>
      <label>
        <span>Due date</span>
        <input
          type="date"
          style={fieldStyle()}
          value={draft.invoice.dueDate ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                dueDate: event.target.value || null,
              },
            })
          }
        />
      </label>
      <label>
        <span>Currency</span>
        <input
          style={fieldStyle()}
          value={draft.invoice.currency}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: { ...draft.invoice, currency: event.target.value },
            })
          }
        />
      </label>
    </>
  );
}

function InvoiceAmountFields({
  draft,
  setDraft,
}: {
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <>
      <label>
        <span>Net amount</span>
        <input
          type="number"
          style={fieldStyle()}
          value={draft.invoice.amountExcludingVat ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                amountExcludingVat: event.target.value
                  ? Number(event.target.value)
                  : null,
              },
            })
          }
        />
      </label>
      <label>
        <span>VAT amount</span>
        <input
          type="number"
          style={fieldStyle()}
          value={draft.invoice.vatAmount ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                vatAmount: event.target.value
                  ? Number(event.target.value)
                  : null,
              },
            })
          }
        />
      </label>
      <label>
        <span>Total amount</span>
        <input
          type="number"
          style={fieldStyle()}
          value={draft.invoice.totalAmount ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                totalAmount: event.target.value
                  ? Number(event.target.value)
                  : null,
              },
            })
          }
        />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span>Notes</span>
        <textarea
          style={{ ...fieldStyle(), minHeight: "90px" }}
          value={draft.invoice.notes ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                notes: event.target.value || null,
              },
            })
          }
        />
      </label>
    </>
  );
}

export function InvoiceSection({
  draft,
  setDraft,
}: {
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <section>
      {sectionTitle("Invoice")}
      <div className="field-grid">
        <InvoiceIdentityFields draft={draft} setDraft={setDraft} />
        <InvoiceAmountFields draft={draft} setDraft={setDraft} />
      </div>
    </section>
  );
}

export function PaymentSection({
  preview,
  draft,
  setDraft,
}: {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <section style={{ marginTop: "2rem" }}>
      {sectionTitle("Payment")}
      <div className="field-grid">
        <PaymentToggle draft={draft} setDraft={setDraft} />
        <PaymentFields preview={preview} draft={draft} setDraft={setDraft} />
      </div>
    </section>
  );
}

function PaymentToggle({
  draft,
  setDraft,
}: {
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <label className="checkbox-line">
      <input
        type="checkbox"
        checked={draft.actions.recordPayment}
        onChange={(event) =>
          setDraft({
            ...draft,
            actions: {
              ...draft.actions,
              recordPayment: event.target.checked,
            },
            payment: {
              ...draft.payment,
              isPaid: event.target.checked,
            },
          })
        }
      />
      <span>Record payment on confirm</span>
    </label>
  );
}

function PaymentFields({
  preview,
  draft,
  setDraft,
}: {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <>
      <label>
        <span>Payment date</span>
        <input
          type="date"
          style={fieldStyle()}
          value={draft.payment.paymentDate ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              payment: {
                ...draft.payment,
                paymentDate: event.target.value || null,
              },
            })
          }
        />
      </label>
      <label>
        <span>Payment amount</span>
        <input
          type="number"
          style={fieldStyle()}
          value={draft.payment.paymentAmount ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              payment: {
                ...draft.payment,
                paymentAmount: event.target.value
                  ? Number(event.target.value)
                  : null,
              },
            })
          }
        />
      </label>
      <label>
        <span>Payment channel</span>
        <select
          style={fieldStyle()}
          value={draft.payment.paymentChannelHint ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              payment: {
                ...draft.payment,
                paymentChannelHint: (event.target.value || null) as
                  | "BANK"
                  | "CASH"
                  | null,
              },
            })
          }
        >
          <option value="">Unspecified</option>
          <option value="BANK">Bank</option>
          <option value="CASH">Cash</option>
        </select>
      </label>
      <label>
        <span>Payment account</span>
        <select
          style={fieldStyle()}
          value={draft.payment.paymentAccountName ?? ""}
          onChange={(event) =>
            setDraft({
              ...draft,
              payment: {
                ...draft.payment,
                paymentAccountName: event.target.value || null,
              },
            })
          }
        >
          <option value="">No account selected</option>
          {preview.referenceData.paymentAccounts.map((account) => (
            <option
              key={`${account.type}-${account.name}`}
              value={account.name}
            >
              {account.type} - {account.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function RowsSection({
  preview,
  draft,
  setDraft,
}: {
  preview: InvoiceImportPreviewResult;
  draft: InvoiceImportDraft;
  setDraft: (draft: InvoiceImportDraft) => void;
}) {
  return (
    <section style={{ marginTop: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        {sectionTitle("Rows")}
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              rows: [...draft.rows, createBlankRow(draft)],
            })
          }
        >
          Add row
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {draft.rows.map((row) => (
          <InvoiceImportRowEditor
            key={row.id}
            draft={draft}
            row={row}
            preview={preview}
            setDraft={setDraft}
          />
        ))}
      </div>
    </section>
  );
}
