export function formatInvoiceImportRowLabel(rowId: string): string {
  const match = rowId.match(/^row-(\d+)$/i);

  if (!match) {
    return rowId;
  }

  return `Row ${Number(match[1])}`;
}
