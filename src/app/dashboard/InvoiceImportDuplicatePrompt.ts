import { InvoiceImportDraft } from "@/lib/invoice-import-types";
import { draftMatchesDuplicateInvoice } from "@/lib/invoice-import/draft-validation";

export function buildDuplicateConfirmationMessage(
  draft: InvoiceImportDraft,
): string | null {
  if (!draft.duplicateInvoice || !draftMatchesDuplicateInvoice(draft)) {
    return null;
  }

  return [
    `Possible duplicate found for vendor "${draft.duplicateInvoice.vendorName}" and invoice "${draft.duplicateInvoice.invoiceNumber}".`,
    "Do you want to proceed anyway?",
  ].join(" ");
}
