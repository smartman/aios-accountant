import {
  AccountingProviderAdapter,
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  FindExistingInvoiceParams,
  FindOrCreateVendorParams,
  MeritBank,
  MeritCredentials,
  MeritPaymentType,
  MeritTax,
  MeritUnit,
  ProviderPaymentAccount,
  ProviderPaymentResult,
  ProviderVendorResult,
  SavedConnectionSummary,
  assertProviderContext,
  toSafeIsoString,
} from "../../accounting-provider-types";
import {
  clearCachedValuesByPrefix,
  getAccounts,
  getBanks,
  getPaymentTypes,
  getTaxes,
  getUnits,
  meritDate,
  meritDateTime,
  meritRequest,
  namespacedCacheKey,
  toOptionalString,
  validateMeritV2Access,
} from "./core";
import { createVendor, findExistingPurchaseInvoice, findVendor } from "./data";
import {
  meritUnitAliases,
  normalizeMeritUnitLabel,
  selectMeritUnitName,
} from "./units";

function buildVendorObject(vendorId: string): Record<string, unknown> {
  return {
    Id: vendorId,
  };
}

function computeTaxAmountForRow(
  row: CreatePurchaseInvoiceParams["rows"][number],
  tax: MeritTax | undefined,
): number {
  if (!tax?.rate) {
    return 0;
  }

  const netAmount =
    row.sum ??
    (row.price !== undefined && row.quantity !== undefined
      ? row.price * row.quantity
      : undefined);

  if (typeof netAmount !== "number" || !Number.isFinite(netAmount)) {
    return 0;
  }

  return Number(((netAmount * tax.rate) / 100).toFixed(2));
}

function pickMeritBank(
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

async function loadMeritContext(credentials: MeritCredentials) {
  const [accounts, taxes, banks, paymentTypes, units] = await Promise.all([
    getAccounts(credentials),
    getTaxes(credentials),
    getBanks(credentials),
    getPaymentTypes(credentials),
    getUnits(credentials),
  ]);

  return {
    provider: "merit" as const,
    referenceData: {
      accounts: accounts.map((account) => ({
        code: account.code,
        label: [account.code, account.name ?? account.nameEn ?? ""]
          .filter(Boolean)
          .join(" - "),
      })),
      taxCodes: taxes.map((tax) => ({
        code: tax.id,
        rate: tax.rate,
        description: [tax.code, tax.name ?? ""].filter(Boolean).join(" - "),
      })),
      paymentAccounts: banks.map((bank) => ({
        id: bank.id,
        type: "BANK" as const,
        name: bank.name,
        currency: bank.currencyCode,
        accountCode: bank.accountCode,
      })),
    },
    raw: {
      accounts,
      taxes,
      banks,
      paymentTypes,
      units,
      vendors: [],
    },
  };
}

function maskSecret(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 3) {
    return trimmed;
  }

  return `${"*".repeat(trimmed.length - 3)}${trimmed.slice(-3)}`;
}

async function findExistingMeritVendor(
  credentials: MeritCredentials,
  params: FindOrCreateVendorParams,
) {
  return (
    (await findVendor(credentials, {
      regNo: params.extraction.vendor.regCode,
      vatRegNo: params.extraction.vendor.vatNumber,
    })) ??
    (await findVendor(credentials, {
      name: params.extraction.vendor.name,
    }))
  );
}

function buildMeritVendorPayload(params: FindOrCreateVendorParams) {
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

function toVendorResult(
  created: Awaited<ReturnType<typeof createVendor>>,
): ProviderVendorResult {
  if (!created.id) {
    throw new Error("Merit did not return a vendor id.");
  }

  return {
    vendorId: created.id,
    vendorName: created.name,
    createdVendor: true,
    existingVendor: null,
  };
}

async function resolveVendor(
  credentials: MeritCredentials,
  params: FindOrCreateVendorParams,
): Promise<ProviderVendorResult> {
  const existingVendor = await findExistingMeritVendor(credentials, params);

  if (existingVendor?.id) {
    return {
      vendorId: existingVendor.id,
      vendorName: existingVendor.name,
      createdVendor: false,
      existingVendor,
    };
  }

  const created = await createVendor(
    credentials,
    buildMeritVendorPayload(params),
  );
  return toVendorResult(created);
}

function buildTaxAmounts(
  params: CreatePurchaseInvoiceParams,
  taxes: MeritTax[],
): Array<{ TaxId: string; Amount: number }> {
  const taxById = new Map(taxes.map((tax) => [tax.id, tax]));
  const groupedTaxes = new Map<string, number>();

  for (const row of params.rows) {
    if (!row.taxCode) {
      continue;
    }

    const taxAmount = computeTaxAmountForRow(row, taxById.get(row.taxCode));
    groupedTaxes.set(
      row.taxCode,
      (groupedTaxes.get(row.taxCode) ?? 0) + taxAmount,
    );
  }

  if (
    groupedTaxes.size === 1 &&
    typeof params.extraction.invoice.vatAmount === "number" &&
    Number.isFinite(params.extraction.invoice.vatAmount)
  ) {
    const onlyTaxId = [...groupedTaxes.keys()][0];
    groupedTaxes.set(onlyTaxId, params.extraction.invoice.vatAmount);
  }

  return [...groupedTaxes.entries()].map(([taxId, amount]) => ({
    TaxId: taxId,
    Amount: Number(amount.toFixed(2)),
  }));
}

function buildMeritRowNetTotal(
  rows: CreatePurchaseInvoiceParams["rows"],
): number | undefined {
  const total = rows.reduce((sum, row) => {
    const rowTotal =
      row.sum ??
      (row.price !== undefined && row.quantity !== undefined
        ? row.price * row.quantity
        : undefined);

    return typeof rowTotal === "number" && Number.isFinite(rowTotal)
      ? sum + rowTotal
      : sum;
  }, 0);

  return total > 0 ? Number(total.toFixed(2)) : undefined;
}

function buildPurchaseInvoiceBody(
  params: CreatePurchaseInvoiceParams,
  units: MeritUnit[],
): Record<string, unknown> {
  return {
    Vendor: buildVendorObject(params.vendorId),
    ExpenseClaim: false,
    DocDate: meritDate(params.extraction.invoice.issueDate),
    DueDate:
      meritDate(params.extraction.invoice.dueDate) ??
      meritDate(params.extraction.invoice.issueDate) ??
      meritDate(params.extraction.invoice.entryDate),
    TransactionDate:
      meritDate(params.extraction.invoice.entryDate) ??
      meritDate(params.extraction.invoice.issueDate),
    BillNo: params.extraction.invoice.invoiceNumber ?? undefined,
    RefNo: params.extraction.invoice.referenceNumber ?? undefined,
    CurrencyCode: params.extraction.invoice.currency ?? "EUR",
    InvoiceRow: params.rows.map((row) => ({
      Item: {
        Code: row.code,
        Description: row.description.slice(0, 100),
        Type: 2,
        UOMName: selectMeritUnitName(units, row.unit),
      },
      Quantity: row.quantity ?? 1,
      Price: row.price ?? row.sum ?? undefined,
      TaxId: row.taxCode ?? undefined,
      GLAccountCode: row.accountCode,
      Description: row.description,
    })),
    TotalAmount:
      buildMeritRowNetTotal(params.rows) ??
      params.extraction.invoice.amountExcludingVat ??
      params.extraction.invoice.totalAmount ??
      undefined,
  };
}

function buildPaymentBody(
  params: CreatePaymentParams,
  paymentAccount: ProviderPaymentAccount,
  paymentAmount: number,
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

export const meritProviderAdapter: AccountingProviderAdapter<MeritCredentials> =
  {
    provider: "merit",

    async validateCredentials(credentials): Promise<SavedConnectionSummary> {
      await validateMeritV2Access(credentials);

      return {
        provider: "merit",
        label: "Merit",
        detail: "Merit credentials verified successfully.",
        verifiedAt: toSafeIsoString(new Date()),
        publicId: credentials.apiId,
        secretMasked: maskSecret(credentials.apiKey),
      };
    },

    async loadContext(credentials) {
      return loadMeritContext(credentials);
    },

    async findOrCreateVendor(
      credentials,
      params: FindOrCreateVendorParams,
    ): Promise<ProviderVendorResult> {
      return resolveVendor(credentials, params);
    },

    async findExistingInvoice(credentials, params: FindExistingInvoiceParams) {
      return findExistingPurchaseInvoice(credentials, params);
    },

    async createPurchaseInvoice(credentials, params, context) {
      const meritContext = assertProviderContext(context, "merit");
      const body = buildPurchaseInvoiceBody(
        params,
        meritContext.raw.units ?? [],
      );
      body.TaxAmount = buildTaxAmounts(params, meritContext.raw.taxes);

      if (params.attachment?.mimeType === "application/pdf") {
        body.Attachment = {
          FileName: params.attachment.filename,
          FileContent: params.attachment.fileContentBase64,
        };
      }

      const response = await meritRequest<Record<string, unknown>>(
        "sendpurchinvoice",
        credentials,
        body,
      );
      clearCachedValuesByPrefix(
        namespacedCacheKey(credentials, "purchaseInvoices:"),
      );
      const invoiceId =
        toOptionalString(response.BillId) ??
        toOptionalString(response.Id) ??
        toOptionalString(response.PIHId);

      if (!invoiceId) {
        throw new Error("Merit did not return a purchase invoice id.");
      }

      return {
        invoiceId,
        attachedFile: Boolean(body.Attachment),
      };
    },

    async createPayment(
      credentials,
      params: CreatePaymentParams,
      context,
    ): Promise<ProviderPaymentResult> {
      const meritContext = assertProviderContext(context, "merit");
      const paymentAccount = pickMeritBank(
        meritContext.raw.banks,
        meritContext.raw.paymentTypes,
        params.extraction.invoice.currency ?? "EUR",
      );

      if (!paymentAccount?.id) {
        throw new Error(
          "The invoice looks paid, but Merit has no usable bank account for the payment.",
        );
      }

      const paymentAmount =
        params.extraction.payment.paymentAmount ??
        params.extraction.invoice.totalAmount ??
        params.extraction.invoice.amountExcludingVat;

      if (!paymentAmount) {
        throw new Error(
          "The invoice looks paid, but the payment amount could not be determined.",
        );
      }

      const response = await meritRequest<Record<string, unknown>>(
        "sendPaymentV",
        credentials,
        buildPaymentBody(params, paymentAccount, paymentAmount),
      );

      return {
        paymentId:
          toOptionalString(response.Id) ??
          toOptionalString(response.PaymentId) ??
          params.invoiceId,
        paymentAccount,
      };
    },

    async attachDocument() {
      // Merit supports PDF attachment inline when the purchase invoice is created.
    },
  };

export const __test__ = {
  buildMeritVendorPayload,
  buildPaymentBody,
  buildPurchaseInvoiceBody,
  buildMeritRowNetTotal,
  buildTaxAmounts,
  computeTaxAmountForRow,
  meritUnitAliases,
  maskSecret,
  normalizeMeritUnitLabel,
  pickMeritBank,
  selectMeritUnitName,
};
