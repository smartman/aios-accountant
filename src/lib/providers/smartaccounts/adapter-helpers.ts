import type { CreatePurchaseInvoiceParams } from "../../accounting-provider-types";
import type { ProviderCreateVendorInput } from "../../accounting-provider-activities";
import type {
  SmartAccountsAccount,
  SmartAccountsBankAccount,
  SmartAccountsCashAccount,
  SmartAccountsVendor,
} from "../../invoice-import-types";
import { choosePaymentAccount, chooseUnpaidAccount } from "./index";

export function maskSecret(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 3) {
    return trimmed;
  }

  return `${"*".repeat(trimmed.length - 3)}${trimmed.slice(-3)}`;
}

export function normalizeNumber(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function toSmartAccountsDate(
  value: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}.${month}.${year}`;
  }

  const estonianMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (estonianMatch) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const day = String(parsed.getUTCDate()).padStart(2, "0");
    return `${day}.${month}.${year}`;
  }

  return undefined;
}

export function buildVendorAddress(
  extraction: ProviderCreateVendorInput["extraction"],
): SmartAccountsVendor["address"] | undefined {
  const hasAddress =
    extraction.vendor.countryCode ||
    extraction.vendor.city ||
    extraction.vendor.postalCode ||
    extraction.vendor.addressLine1 ||
    extraction.vendor.addressLine2;

  if (!hasAddress) {
    return undefined;
  }

  return {
    country: extraction.vendor.countryCode ?? undefined,
    city: extraction.vendor.city ?? undefined,
    postalCode: extraction.vendor.postalCode ?? undefined,
    address1: extraction.vendor.addressLine1 ?? undefined,
    address2: extraction.vendor.addressLine2 ?? undefined,
  };
}

export function buildVendorPayload(
  extraction: ProviderCreateVendorInput["extraction"],
  accounts: SmartAccountsAccount[],
): SmartAccountsVendor {
  const unpaidAccount = chooseUnpaidAccount(accounts);

  return {
    name: extraction.vendor.name ?? "Unknown vendor",
    regCode: extraction.vendor.regCode ?? undefined,
    vatNumber: extraction.vendor.vatNumber ?? undefined,
    bankAccount: extraction.vendor.bankAccount ?? undefined,
    accountUnpaid: unpaidAccount?.code,
    address: buildVendorAddress(extraction),
  };
}

export function findExplicitPaymentAccount(params: {
  bankAccounts: SmartAccountsBankAccount[];
  cashAccounts: SmartAccountsCashAccount[];
  paymentAccountName: string | null;
  currency: string;
  channelHint: "BANK" | "CASH" | null;
}) {
  const paymentAccountName = params.paymentAccountName?.trim();
  if (!paymentAccountName) {
    return null;
  }

  const lowerCaseName = paymentAccountName.toLowerCase();
  return choosePaymentAccount({
    bankAccounts: params.bankAccounts.filter(
      (account) => account.name.trim().toLowerCase() === lowerCaseName,
    ),
    cashAccounts: params.cashAccounts.filter(
      (account) => account.name.trim().toLowerCase() === lowerCaseName,
    ),
    currency: params.currency,
    channelHint: params.channelHint,
  });
}

export function buildInvoicePayload(
  params: CreatePurchaseInvoiceParams,
): Record<string, unknown> {
  const currency = params.extraction.invoice.currency ?? "EUR";
  const issueDate = firstNonEmpty(
    params.extraction.invoice.issueDate,
    params.extraction.invoice.entryDate,
  );
  const issueDateForSmartAccounts = toSmartAccountsDate(issueDate);

  if (!issueDate || !issueDateForSmartAccounts) {
    throw new Error(
      "The invoice date could not be extracted from the uploaded file.",
    );
  }

  return {
    vendorId: params.vendorId,
    date: issueDateForSmartAccounts,
    entryDate:
      toSmartAccountsDate(
        firstNonEmpty(params.extraction.invoice.entryDate, issueDate),
      ) ?? issueDateForSmartAccounts,
    dueDate: toSmartAccountsDate(params.extraction.invoice.dueDate),
    invoiceNumber: params.extraction.invoice.invoiceNumber ?? undefined,
    referenceNumber: params.extraction.invoice.referenceNumber ?? undefined,
    currency,
    isCalculateVat: true,
    amount: normalizeNumber(params.extraction.invoice.amountExcludingVat),
    vatAmount: normalizeNumber(params.extraction.invoice.vatAmount),
    totalAmount: normalizeNumber(params.extraction.invoice.totalAmount),
    comment: params.extraction.invoice.notes ?? undefined,
    rows: params.rows.map((row, index) => ({
      code: row.code,
      description: row.description,
      quantity: row.quantity ?? 1,
      unit: row.unit ?? undefined,
      price: row.price ?? undefined,
      sum: row.sum ?? undefined,
      vatPc: row.taxCode ?? undefined,
      order: index + 1,
      accountPurchase: row.accountCode,
    })),
  };
}
