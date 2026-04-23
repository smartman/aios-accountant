import { SmartAccountsCredentials } from "../../accounting-provider-types";
import {
  ProviderCatalogArticle,
  ProviderHistoricalInvoiceRow,
} from "../../accounting-provider-activities";
import {
  SmartAccountsArticle,
  InvoiceExtraction,
} from "../../invoice-import-types";
import {
  asRecord,
  extractArray,
  smartAccountsRequest,
  toOptionalString,
} from "./core";
import { getArticles } from "./loaders";

function normalizeCatalogArticle(
  article: SmartAccountsArticle,
): ProviderCatalogArticle {
  return {
    code: article.code,
    description: article.description ?? article.code,
    unit: article.unit,
    purchaseAccountCode: article.accountPurchase,
    taxCode: article.vatPc,
    type: article.type,
    activePurchase: article.activePurchase,
  };
}

export async function listCatalogArticles(
  credentials: SmartAccountsCredentials,
): Promise<ProviderCatalogArticle[]> {
  const articles = await getArticles(credentials);
  return articles.map(normalizeCatalogArticle);
}

function invoiceDateFromExtraction(extraction: InvoiceExtraction): string {
  const value =
    extraction.invoice.issueDate ??
    extraction.invoice.entryDate ??
    new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "01.01.2000";
  }

  const date = new Date(parsed.getTime() - 365 * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${day}.${month}.${year}`;
}

export async function getVendorInvoiceHistory(
  credentials: SmartAccountsCredentials,
  params: {
    vendorId: string;
    extraction: InvoiceExtraction;
  },
): Promise<ProviderHistoricalInvoiceRow[]> {
  const response = await smartAccountsRequest<unknown>(
    "/purchasesales/vendorinvoices",
    "get",
    credentials,
    {
      query: {
        vendorId: params.vendorId,
        dateFrom: invoiceDateFromExtraction(params.extraction),
        pageNumber: 1,
      },
    },
  );

  return extractArray<Record<string, unknown>>(response, [
    "vendorInvoices",
    "invoices",
  ]).flatMap((invoice) => {
    const invoiceId = toOptionalString(invoice.invoiceId ?? invoice.id);
    const vendorId = toOptionalString(invoice.vendorId);
    const vendorName = toOptionalString(invoice.vendorName ?? invoice.name);
    if (!invoiceId || !vendorId || !vendorName) {
      return [];
    }

    const rows = extractArray<Record<string, unknown>>(invoice.rows, ["rows"]);
    return rows
      .map((row): ProviderHistoricalInvoiceRow | null => {
        const record = asRecord(row);
        if (!record) {
          return null;
        }

        const articleCode = toOptionalString(record.code);
        const description = toOptionalString(record.description);
        if (!articleCode || !description) {
          return null;
        }

        return {
          invoiceId,
          invoiceNumber: toOptionalString(invoice.invoiceNumber),
          issueDate: toOptionalString(invoice.date ?? invoice.entryDate),
          vendorId,
          vendorName,
          description,
          articleCode,
          articleDescription: description,
          purchaseAccountCode: toOptionalString(record.accountPurchase),
          taxCode: toOptionalString(record.vatPc),
          unit: toOptionalString(record.unit),
        };
      })
      .filter((value): value is ProviderHistoricalInvoiceRow => value !== null);
  });
}
