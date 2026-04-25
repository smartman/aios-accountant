import {
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  FindExistingInvoiceParams,
  MeritCredentials,
  MeritTax,
  MeritUnit,
  ProviderPaymentResult,
  SavedConnectionSummary,
  assertProviderContext,
  toSafeIsoString,
} from "../../accounting-provider-types";
import {
  AccountingProviderActivities,
  ProviderCreateVendorInput,
} from "../../accounting-provider-activities";
import {
  clearCachedValuesByPrefix,
  getAccounts,
  getBanks,
  getTaxes,
  getUnits,
  getPaymentTypes,
  meritDate,
  meritDateTime,
  meritRequest,
  namespacedCacheKey,
  toOptionalString,
  validateMeritV2Access,
} from "./core";
import { getDimensions } from "./dimensions";
import {
  buildMeritVendorPayload,
  buildPaymentBody,
  buildVendorObject,
  computeTaxAmountForRow,
  findExplicitMeritBank,
  maskSecret,
  pickMeritBank,
} from "./adapter-helpers";
import {
  createVendor,
  findExistingPurchaseInvoice,
  findVendor,
  getVendorInvoiceHistory,
  listItems,
} from "./data";
import {
  deriveInvoiceRoundingAmount,
  derivePreciseUnitPrice,
  isFiniteAmount,
  resolveAuthoritativeRowNetAmount,
  roundCurrencyAmount,
} from "../../invoice-import/amounts";
import {
  meritUnitAliases,
  normalizeMeritUnitLabel,
  selectMeritUnitName,
} from "./units";

async function loadMeritContext(credentials: MeritCredentials) {
  const [accounts, taxes, banks, paymentTypes, units, dimensions] =
    await Promise.all([
      getAccounts(credentials),
      getTaxes(credentials),
      getBanks(credentials),
      getPaymentTypes(credentials),
      getUnits(credentials),
      getDimensions(credentials),
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
      dimensions: dimensions
        .filter((dimension) => dimension.nonActive !== true)
        .map((dimension) => ({
          code: dimension.code,
          name: [dimension.dimName, `${dimension.code} - ${dimension.name}`]
            .filter(Boolean)
            .join(": "),
          dimId: dimension.dimId,
          dimValueId: dimension.id,
          dimCode: dimension.code,
        })),
    },
    raw: {
      accounts,
      taxes,
      banks,
      paymentTypes,
      units,
      items: [],
      vendors: [],
      dimensions,
    },
  };
}

async function findExistingMeritVendor(
  credentials: MeritCredentials,
  extraction: ProviderCreateVendorInput["extraction"],
) {
  return (
    (await findVendor(credentials, {
      regNo: extraction.vendor.regCode,
      vatRegNo: extraction.vendor.vatNumber,
    })) ??
    (await findVendor(credentials, {
      name: extraction.vendor.name,
    }))
  );
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
  const total = rows.reduce(
    (sum, row) => sum + (resolveAuthoritativeRowNetAmount(row) ?? 0),
    0,
  );

  return total > 0 ? roundCurrencyAmount(total) : undefined;
}

function buildMeritDimensions(params: CreatePurchaseInvoiceParams) {
  const dimension = (params.referenceData.dimensions ?? []).find(
    (candidate) => candidate.code === params.extraction.dimension?.code,
  );

  if (!dimension?.dimId || !dimension.dimValueId || !dimension.dimCode) {
    return undefined;
  }

  return [
    {
      DimId: dimension.dimId,
      DimValueId: dimension.dimValueId,
      DimCode: dimension.dimCode,
    },
  ];
}

function buildPurchaseInvoiceBody(
  params: CreatePurchaseInvoiceParams,
  units: MeritUnit[],
): Record<string, unknown> {
  const roundingAmount = deriveInvoiceRoundingAmount(params.extraction.invoice);
  const fallbackTotalAmount = isFiniteAmount(
    params.extraction.invoice.amountExcludingVat,
  )
    ? roundCurrencyAmount(params.extraction.invoice.amountExcludingVat)
    : isFiniteAmount(params.extraction.invoice.totalAmount)
      ? roundCurrencyAmount(params.extraction.invoice.totalAmount)
      : undefined;
  const dimensions = buildMeritDimensions(params);

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
    Dimensions: dimensions,
    InvoiceRow: params.rows.map((row) => ({
      Item: {
        Code: row.code,
        Description: row.description.slice(0, 100),
        Type: 2,
        UOMName: selectMeritUnitName(units, row.unit),
      },
      Quantity: row.quantity ?? 1,
      Price: derivePreciseUnitPrice(row),
      TaxId: row.taxCode ?? undefined,
      GLAccountCode: row.accountCode,
      Description: row.description,
      Dimensions: dimensions,
    })),
    RoundingAmount: roundingAmount,
    TotalAmount: buildMeritRowNetTotal(params.rows) ?? fallbackTotalAmount,
  };
}

export const meritProviderAdapter: AccountingProviderActivities<MeritCredentials> =
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

    async findVendor(credentials, input) {
      const existingVendor = await findExistingMeritVendor(
        credentials,
        input.extraction,
      );

      return existingVendor?.id
        ? {
            vendorId: existingVendor.id,
            vendorName: existingVendor.name,
          }
        : null;
    },

    async createVendor(credentials, input) {
      const created = await createVendor(
        credentials,
        buildMeritVendorPayload(input),
      );
      if (!created.id) {
        throw new Error("Merit did not return a vendor id.");
      }
      return {
        vendorId: created.id,
        vendorName: created.name,
      };
    },

    async findExistingInvoice(credentials, params: FindExistingInvoiceParams) {
      return findExistingPurchaseInvoice(credentials, params);
    },

    async listArticles(credentials, context) {
      assertProviderContext(context, "merit");
      return listItems(credentials);
    },

    async getVendorArticleHistory(credentials, params, context) {
      assertProviderContext(context, "merit");
      return getVendorInvoiceHistory(credentials, params);
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
      const paymentAccount =
        findExplicitMeritBank(
          meritContext.raw.banks,
          meritContext.raw.paymentTypes,
          params.paymentAccountName,
        ) ??
        pickMeritBank(
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
        buildPaymentBody(
          params,
          paymentAccount,
          roundCurrencyAmount(paymentAmount),
          meritDateTime,
        ),
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
  buildPaymentBody: (
    params: CreatePaymentParams,
    paymentAccount: NonNullable<ReturnType<typeof pickMeritBank>>,
    paymentAmount: number,
  ) => buildPaymentBody(params, paymentAccount, paymentAmount, meritDateTime),
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
