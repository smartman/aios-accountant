import {
  CreatePaymentParams,
  FindExistingInvoiceParams,
  ProviderPaymentResult,
  SavedConnectionSummary,
  SmartAccountsCredentials,
  assertProviderContext,
  toSafeIsoString,
} from "../../accounting-provider-types";
import { AccountingProviderActivities } from "../../accounting-provider-activities";
import {
  choosePaymentAccount,
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
  getVendorInvoiceHistory,
  getVatPcs,
  listCatalogArticles,
  uploadDocumentAttachment,
} from "./index";
import {
  buildVendorAddress,
  buildInvoicePayload,
  buildVendorPayload,
  findExplicitPaymentAccount,
  firstNonEmpty,
  maskSecret,
  normalizeNumber,
  normalizeRoundedNumber,
  toSmartAccountsDate,
} from "./adapter-helpers";

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

export const smartAccountsProviderAdapter: AccountingProviderActivities<SmartAccountsCredentials> =
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

    async findVendor(credentials, input) {
      const vendorSearchTerm = firstNonEmpty(
        input.extraction.vendor.regCode,
        input.extraction.vendor.vatNumber,
        input.extraction.vendor.name,
      );

      if (!vendorSearchTerm) {
        return null;
      }

      const existingVendor = await findVendor(credentials, vendorSearchTerm);
      return existingVendor?.id
        ? {
            vendorId: existingVendor.id,
            vendorName: existingVendor.name,
          }
        : null;
    },

    async createVendor(credentials, input, context) {
      const smartAccountsContext = assertProviderContext(
        context,
        "smartaccounts",
      );
      const created = await createVendor(
        credentials,
        buildVendorPayload(input.extraction, smartAccountsContext.raw.accounts),
      );

      return {
        vendorId: created.vendorId,
        vendorName: input.extraction.vendor.name ?? "Unknown vendor",
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

    async listArticles(credentials, context) {
      assertProviderContext(context, "smartaccounts");
      return listCatalogArticles(credentials);
    },

    async getVendorArticleHistory(credentials, params, context) {
      assertProviderContext(context, "smartaccounts");
      return getVendorInvoiceHistory(credentials, params);
    },

    async createPurchaseInvoice(credentials, params, context) {
      assertProviderContext(context, "smartaccounts");
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
      const currency = params.extraction.invoice.currency ?? "EUR";
      const selectedPaymentAccount =
        findExplicitPaymentAccount({
          bankAccounts: smartAccountsContext.raw.bankAccounts,
          cashAccounts: smartAccountsContext.raw.cashAccounts,
          paymentAccountName: params.paymentAccountName ?? null,
          currency,
          channelHint: params.extraction.payment.paymentChannelHint,
        }) ??
        choosePaymentAccount({
          bankAccounts: smartAccountsContext.raw.bankAccounts,
          cashAccounts: smartAccountsContext.raw.cashAccounts,
          currency,
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

      const roundedPaymentAmount = normalizeRoundedNumber(paymentAmount);
      if (roundedPaymentAmount === undefined) {
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
        currency,
        amount: roundedPaymentAmount,
        document: params.extraction.invoice.invoiceNumber ?? undefined,
        rows: [
          {
            description:
              params.extraction.invoice.invoiceNumber ??
              "Imported invoice payment",
            amount: roundedPaymentAmount,
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
  buildVendorAddress,
  buildInvoicePayload,
  buildVendorPayload,
  firstNonEmpty,
  maskSecret,
  normalizeNumber,
  toSmartAccountsDate,
};
