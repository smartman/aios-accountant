import type {
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  MeritBank,
  MeritPaymentType,
  MeritTax,
  ProviderPaymentAccount,
} from "../../accounting-provider-types";
import type { ProviderCreateVendorInput } from "../../accounting-provider-activities";
import { resolveAuthoritativeRowNetAmount } from "../../invoice-import/amounts";

export function buildVendorObject(vendorId: string): Record<string, unknown> {
  return {
    Id: vendorId,
  };
}

export function computeTaxAmountForRow(
  row: CreatePurchaseInvoiceParams["rows"][number],
  tax: MeritTax | undefined,
): number {
  if (!tax?.rate) {
    return 0;
  }

  const netAmount = resolveAuthoritativeRowNetAmount(row);
  if (netAmount === undefined) {
    return 0;
  }

  return Number(((netAmount * tax.rate) / 100).toFixed(2));
}

export function pickMeritBank(
  banks: MeritBank[],
  paymentTypes: MeritPaymentType[],
  currency: string,
): ProviderPaymentAccount | null {
  const paymentTypeNames = new Set(
    paymentTypes.map((paymentType) => paymentType.name),
  );
  const matchingBank = banks.find(
    (bank) =>
      (bank.currencyCode ?? "EUR").toUpperCase() === currency.toUpperCase(),
  );
  const bank = matchingBank ?? banks[0];
  if (!bank) {
    return null;
  }

  return {
    id: bank.id,
    name: paymentTypeNames.has(bank.name) ? bank.name : bank.name,
    type: "BANK",
    currency: bank.currencyCode,
    accountCode: bank.accountCode,
  };
}

export function findExplicitMeritBank(
  banks: MeritBank[],
  paymentTypes: MeritPaymentType[],
  paymentAccountName: string | null | undefined,
): ProviderPaymentAccount | null {
  const trimmedName = paymentAccountName?.trim();
  if (!trimmedName) {
    return null;
  }

  const lowerCaseName = trimmedName.toLowerCase();
  const matchingBank = banks.find(
    (bank) => bank.name.trim().toLowerCase() === lowerCaseName,
  );
  if (!matchingBank) {
    return null;
  }

  return pickMeritBank(
    [matchingBank],
    paymentTypes,
    matchingBank.currencyCode ?? "EUR",
  );
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 3) {
    return trimmed;
  }

  return `${"*".repeat(trimmed.length - 3)}${trimmed.slice(-3)}`;
}

export function buildMeritVendorPayload(params: ProviderCreateVendorInput) {
  return {
    name: params.extraction.vendor.name ?? "Unknown vendor",
    regNo: params.extraction.vendor.regCode ?? undefined,
    vatRegNo: params.extraction.vendor.vatNumber ?? undefined,
    bankAccount: params.extraction.vendor.bankAccount ?? undefined,
    referenceNo: params.extraction.invoice.referenceNumber ?? undefined,
    address:
      params.extraction.vendor.addressLine1 ??
      params.extraction.vendor.addressLine2 ??
      undefined,
    city: params.extraction.vendor.city ?? undefined,
    county: undefined,
    postalCode: params.extraction.vendor.postalCode ?? undefined,
    countryCode: params.extraction.vendor.countryCode ?? "EE",
    email: params.extraction.vendor.email ?? undefined,
    phoneNo: params.extraction.vendor.phone ?? undefined,
  };
}

export function buildPaymentBody(
  params: CreatePaymentParams,
  paymentAccount: ProviderPaymentAccount,
  paymentAmount: number,
  meritDateTime: (value?: string | null) => string | undefined,
): Record<string, unknown> {
  return {
    BankId: paymentAccount.id,
    IBAN: params.extraction.vendor.bankAccount ?? undefined,
    VendorName: params.vendorName,
    PaymentDate: meritDateTime(
      params.extraction.payment.paymentDate ??
        params.extraction.invoice.issueDate ??
        params.extraction.invoice.entryDate,
    ),
    BillNo: params.extraction.invoice.invoiceNumber ?? undefined,
    RefNo: params.extraction.invoice.referenceNumber ?? undefined,
    Amount: paymentAmount,
    CurrencyCode:
      (params.extraction.invoice.currency ?? "EUR").toUpperCase() === "EUR"
        ? undefined
        : (params.extraction.invoice.currency ?? "EUR"),
  };
}
