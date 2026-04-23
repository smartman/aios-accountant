import {
  InvoiceImportDraft,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  compactFieldLabelClass,
  stackedFieldLabelClass,
  fieldClass,
  sectionTitle,
} from "./InvoiceImportReviewShared";
import { FormattedAmountInput } from "./FormattedAmountInput";

const reviewSectionClass =
  "flex flex-col gap-4 rounded-[16px] border border-slate-300/25 bg-white/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.32),_0_10px_24px_rgba(15,23,42,0.06)] sm:gap-5 sm:rounded-[18px] sm:p-[1.35rem] dark:border-slate-700/30 dark:bg-slate-900/20";
const reviewSectionHeaderClass =
  "flex flex-wrap items-start justify-between gap-4";
const reviewSectionCopyClass =
  "mt-[0.35rem] max-w-[42ch] text-sm leading-5 sm:leading-6 text-slate-500 dark:text-slate-400";
const reviewInlineNoteClass =
  "rounded-[14px] border border-slate-300/25 bg-white/20 p-[0.9rem_1rem] text-sm text-slate-500 dark:border-slate-600/40 dark:bg-slate-900/30 dark:text-slate-200";
const reviewInlineNoteMatchedClass =
  "rounded-[14px] border border-emerald-300/60 bg-emerald-50 p-[0.9rem_1rem] text-sm text-slate-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
const reviewFieldLabelClass = stackedFieldLabelClass;
const fieldGridClass = "grid w-full grid-cols-1 gap-4 sm:grid-cols-2";
const paymentFieldsClass =
  "mt-4 grid w-full grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4";
const checkboxLineClass = "inline-flex flex-row items-center gap-2.5";
const paymentFieldLabelClass = compactFieldLabelClass;
export { RowsSection } from "./InvoiceImportRowsSection";

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
    <section className={reviewSectionClass}>
      <div className={reviewSectionHeaderClass}>
        <div>
          {sectionTitle("Vendor")}
          <p className={reviewSectionCopyClass}>
            Confirm the supplier identity. Matching vendors are reused
            automatically and a new vendor is created only when no match exists.
          </p>
        </div>
      </div>
      <div
        className={
          existingVendorLabel
            ? reviewInlineNoteMatchedClass
            : reviewInlineNoteClass
        }
      >
        {existingVendorLabel
          ? `Preview match: ${existingVendorLabel}. Confirm will reuse this vendor if the details still match.`
          : "No exact vendor match was found in preview. Confirm will create a new vendor only if a matching vendor still cannot be found."}
      </div>
      <div className={fieldGridClass}>
        <label className="flex min-w-0 flex-col gap-2 text-sm">
          <span className={reviewFieldLabelClass}>Name</span>
          <input
            className={fieldClass()}
            value={draft.vendor.name}
            onChange={(event) =>
              setDraft({
                ...draft,
                vendor: { ...draft.vendor, name: event.target.value },
              })
            }
          />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm">
          <span className={reviewFieldLabelClass}>Registry code</span>
          <input
            className={fieldClass()}
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
        <label className="flex min-w-0 flex-col gap-2 text-sm">
          <span className={reviewFieldLabelClass}>VAT number</span>
          <input
            className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Invoice number</span>
        <input
          className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Issue date</span>
        <input
          type="date"
          className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Due date</span>
        <input
          type="date"
          className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Currency</span>
        <input
          className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Net amount</span>
        <FormattedAmountInput
          value={draft.invoice.amountExcludingVat}
          onChange={(value) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                amountExcludingVat: value,
              },
            })
          }
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>VAT amount</span>
        <FormattedAmountInput
          value={draft.invoice.vatAmount}
          onChange={(value) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                vatAmount: value,
              },
            })
          }
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Total amount</span>
        <FormattedAmountInput
          value={draft.invoice.totalAmount}
          onChange={(value) =>
            setDraft({
              ...draft,
              invoice: {
                ...draft.invoice,
                totalAmount: value,
              },
            })
          }
        />
      </label>
      <label className="col-span-full flex min-w-0 flex-col gap-2 text-sm">
        <span className={reviewFieldLabelClass}>Notes</span>
        <textarea
          className={fieldClass("min-h-[90px]")}
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
    <section className={reviewSectionClass}>
      <div className={reviewSectionHeaderClass}>
        <div>{sectionTitle("Invoice")}</div>
      </div>
      <div className={fieldGridClass}>
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
    <section className={`${reviewSectionClass} mt-6 sm:mt-8`}>
      <div className={reviewSectionHeaderClass}>
        <div>{sectionTitle("Payment")}</div>
      </div>
      <div className="rounded-[14px] border border-slate-300/20 bg-white/20 p-[0.9rem_1rem]">
        <PaymentToggle draft={draft} setDraft={setDraft} />
      </div>
      <div className={paymentFieldsClass}>
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
    <label className={`${checkboxLineClass} flex-wrap`}>
      <input
        type="checkbox"
        className="mt-px h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={paymentFieldLabelClass}>Payment date</span>
        <input
          type="date"
          className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={paymentFieldLabelClass}>Payment amount</span>
        <FormattedAmountInput
          value={draft.payment.paymentAmount}
          onChange={(value) =>
            setDraft({
              ...draft,
              payment: {
                ...draft.payment,
                paymentAmount: value,
              },
            })
          }
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={paymentFieldLabelClass}>Payment channel</span>
        <select
          className={fieldClass()}
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
      <label className="flex min-w-0 flex-col gap-2 text-sm">
        <span className={paymentFieldLabelClass}>Payment account</span>
        <select
          className={fieldClass()}
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
