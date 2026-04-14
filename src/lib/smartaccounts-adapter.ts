import {
  AccountingProviderAdapter,
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  FindExistingInvoiceParams,
  FindOrCreateVendorParams,
  ProviderPaymentResult,
  ProviderRuntimeContext,
  ProviderVendorResult,
  SavedConnectionSummary,
  SmartAccountsCredentials,
  assertProviderContext,
  toSafeIsoString,
} from "./accounting-provider-types";
import {
  SmartAccountsAccount,
  SmartAccountsVendor,
} from "./invoice-import-types";
import {
  choosePaymentAccount,
  chooseRelevantArticle,
  chooseUnpaidAccount,
  createArticle,
  createPayment,
  createVendor,
  createVendorInvoice,
  findExistingVendorInvoice,
  findVendor,
  formatAccountLabel,
  getAccounts,
  getArticles,
  getBankAccounts,
  getCashAccounts,
  getVatPcs,
  uploadDocumentAttachment,
} from "./smartaccounts";

function maskSecret(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 3) {
    return trimmed;
  }

  return `${"*".repeat(trimmed.length - 3)}${trimmed.slice(-3)}`;
}

function normalizeNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function toSmartAccountsDate(
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

function buildVendorAddress(
  extraction: FindOrCreateVendorParams["extraction"],
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

function buildVendorPayload(
  extraction: FindOrCreateVendorParams["extraction"],
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

async function ensureArticlesExist(
  credentials: SmartAccountsCredentials,
  params: CreatePurchaseInvoiceParams,
  context: Extract<ProviderRuntimeContext, { provider: "smartaccounts" }>,
): Promise<void> {
  const articles = [...context.raw.articles];

  for (const row of params.rows) {
    const exact = articles.find((article) => article.code === row.code);
    if (exact) {
      row.code = exact.code;
      continue;
    }

    const relevant = chooseRelevantArticle({
      articles,
      description: row.description,
      accountPurchase: row.accountCode,
      unit: row.unit,
      vatPc: row.taxCode,
    });
    if (relevant) {
      row.code = relevant.code;
      continue;
    }

    const created = await createArticle(credentials, {
      code: row.code,
      description: row.description,
      type: "SERVICE",
      activePurchase: true,
      activeSales: false,
      unit: row.unit ?? "pcs",
      vatPc: row.taxCode ?? undefined,
      accountPurchase: row.accountCode,
    });

    row.code = created.code;
    articles.push({
      code: created.code,
      description: row.description,
      unit: row.unit ?? "pcs",
      type: "SERVICE",
      activePurchase: true,
      activeSales: false,
      accountPurchase: row.accountCode,
      vatPc: row.taxCode,
    });
  }
}

function buildInvoicePayload(
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

async function loadSmartAccountsContext(credentials: SmartAccountsCredentials) {
  const [accounts, vatPcs, bankAccounts, cashAccounts, articles] =
    await Promise.all([
      getAccounts(credentials),
      getVatPcs(credentials),
      getBankAccounts(credentials),
      getCashAccounts(credentials),
      getArticles(credentials),
    ]);

  return {
    provider: "smartaccounts" as const,
    referenceData: {
      accounts: accounts.map((account) => ({
        code: account.code,
        type: account.type ?? undefined,
        label: formatAccountLabel(account),
      })),
      taxCodes: vatPcs.map((vatPc) => ({
        code: vatPc.vatPc,
        rate: vatPc.percent ?? undefined,
        description: vatPc.description ?? undefined,
        purchaseAccountCode: vatPc.accountPurchase ?? undefined,
      })),
      paymentAccounts: [
        ...bankAccounts.map((account) => ({
          type: "BANK" as const,
          name: account.name,
          currency: account.currency,
          accountCode: account.account,
        })),
        ...cashAccounts.map((account) => ({
          type: "CASH" as const,
          name: account.name,
          currency: account.currency,
          accountCode: account.account,
        })),
      ],
    },
    raw: {
      accounts,
      vatPcs,
      bankAccounts,
      cashAccounts,
      articles,
    },
  };
}

export const smartAccountsProviderAdapter: AccountingProviderAdapter<SmartAccountsCredentials> =
  {
    provider: "smartaccounts",

    async validateCredentials(credentials): Promise<SavedConnectionSummary> {
      const accounts = await getAccounts(credentials);
      if (!accounts.length) {
        throw new Error(
          "SmartAccounts returned no chart of accounts for these credentials.",
        );
      }

      return {
        provider: "smartaccounts",
        label: "SmartAccounts",
        detail: "SmartAccounts credentials verified successfully.",
        verifiedAt: toSafeIsoString(new Date()),
        publicId: credentials.apiKey,
        secretMasked: maskSecret(credentials.secretKey),
      };
    },

    async loadContext(credentials) {
      return loadSmartAccountsContext(credentials);
    },

    async findOrCreateVendor(
      credentials,
      params,
      context,
    ): Promise<ProviderVendorResult> {
      const smartAccountsContext = assertProviderContext(
        context,
        "smartaccounts",
      );
      const vendorSearchTerm = firstNonEmpty(
        params.extraction.vendor.regCode,
        params.extraction.vendor.name,
        params.extraction.vendor.vatNumber,
      );

      if (!vendorSearchTerm) {
        throw new Error(
          "The invoice did not contain a usable vendor name or registry code.",
        );
      }

      const existingVendor = await findVendor(credentials, vendorSearchTerm);
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
        buildVendorPayload(
          params.extraction,
          smartAccountsContext.raw.accounts,
        ),
      );

      return {
        vendorId: created.vendorId,
        vendorName: params.extraction.vendor.name ?? "Unknown vendor",
        createdVendor: true,
        existingVendor: null,
      };
    },

    async findExistingInvoice(credentials, params: FindExistingInvoiceParams) {
      const dateFrom =
        toSmartAccountsDate(
          params.extraction.invoice.issueDate ??
            params.extraction.invoice.entryDate ??
            "2000-01-01",
        ) ?? "01.01.2000";

      return findExistingVendorInvoice(
        credentials,
        params.vendorId,
        params.invoiceNumber,
        dateFrom,
      );
    },

    async createPurchaseInvoice(credentials, params, context) {
      const smartAccountsContext = assertProviderContext(
        context,
        "smartaccounts",
      );
      await ensureArticlesExist(credentials, params, smartAccountsContext);
      const created = await createVendorInvoice(
        credentials,
        buildInvoicePayload(params),
      );

      return {
        invoiceId: created.invoiceId,
        attachedFile: false,
      };
    },

    async createPayment(
      credentials,
      params: CreatePaymentParams,
      context,
    ): Promise<ProviderPaymentResult> {
      const smartAccountsContext = assertProviderContext(
        context,
        "smartaccounts",
      );
      const selectedPaymentAccount = choosePaymentAccount({
        bankAccounts: smartAccountsContext.raw.bankAccounts,
        cashAccounts: smartAccountsContext.raw.cashAccounts,
        currency: params.extraction.invoice.currency ?? "EUR",
        channelHint: params.extraction.payment.paymentChannelHint,
      });

      if (!selectedPaymentAccount) {
        throw new Error(
          "The invoice looks paid, but SmartAccounts has no usable bank or cash account for the payment.",
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

      const payment = await createPayment(credentials, {
        date:
          toSmartAccountsDate(
            params.extraction.payment.paymentDate ??
              params.extraction.invoice.issueDate ??
              params.extraction.invoice.entryDate,
          ) ?? undefined,
        partnerType: "VENDOR",
        vendorId: params.vendorId,
        accountType: selectedPaymentAccount.type,
        accountName: selectedPaymentAccount.name,
        currency: params.extraction.invoice.currency ?? "EUR",
        amount: paymentAmount,
        document: params.extraction.invoice.invoiceNumber ?? undefined,
        rows: [
          {
            description:
              params.extraction.invoice.invoiceNumber ??
              "Imported invoice payment",
            amount: paymentAmount,
            type: "VENDOR_INVOICE",
            id: params.invoiceId,
          },
        ],
      });

      return {
        paymentId: payment.paymentId,
        paymentAccount: {
          type: selectedPaymentAccount.type,
          name: selectedPaymentAccount.name,
          currency: selectedPaymentAccount.currency,
          accountCode: selectedPaymentAccount.account,
        },
      };
    },

    async attachDocument(credentials, params) {
      await uploadDocumentAttachment({
        credentials,
        docId: params.invoiceId,
        filename: params.filename,
        mimeType: params.mimeType,
        fileContentBase64: params.fileContentBase64,
      });
    },
  };

export const __test__ = {
  buildInvoicePayload,
  buildVendorPayload,
  buildVendorAddress,
  firstNonEmpty,
  maskSecret,
  normalizeNumber,
  toSmartAccountsDate,
};
