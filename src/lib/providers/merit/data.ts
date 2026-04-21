import {
  FindExistingInvoiceParams,
  MeritCredentials,
  MeritItem,
  MeritVendor,
} from "../../accounting-provider-types";
import {
  ProviderCatalogArticle,
  ProviderHistoricalInvoiceRow,
} from "../../accounting-provider-activities";
import {
  CACHE_TTLS,
  cachedValue,
  clearCachedValuesByPrefix,
  extractList,
  getItems,
  meritDate,
  meritRequest,
  namespacedCacheKey,
  setCachedValue,
  toOptionalString,
  isNonNull,
} from "./core";

function normalizeVendor(record: Record<string, unknown>): MeritVendor | null {
  const id = toOptionalString(record.VendorId);
  const name = toOptionalString(record.Name);
  if (!name) {
    return null;
  }

  return {
    id,
    name,
    regNo: toOptionalString(record.RegNo),
    vatRegNo: toOptionalString(record.VatRegNo),
    bankAccount: toOptionalString(record.BankAccount),
    referenceNo: toOptionalString(record.ReferenceNo),
    address: toOptionalString(record.Address),
    city: toOptionalString(record.City),
    county: toOptionalString(record.County),
    postalCode: toOptionalString(record.PostalCode),
    countryCode: toOptionalString(record.CountryCode),
    email: toOptionalString(record.Email),
    phoneNo: toOptionalString(record.PhoneNo),
  };
}

export async function findVendor(
  credentials: MeritCredentials,
  params: {
    regNo?: string | null;
    vatRegNo?: string | null;
    name?: string | null;
  },
): Promise<MeritVendor | null> {
  const queryBody: Record<string, unknown> = {};

  if (params.regNo) {
    queryBody.RegNo = params.regNo;
  } else if (params.vatRegNo) {
    queryBody.VatRegNo = params.vatRegNo;
  } else if (params.name) {
    queryBody.Name = params.name;
  } else {
    return null;
  }

  const cacheKey = namespacedCacheKey(
    credentials,
    `vendor:${JSON.stringify(queryBody)}`,
  );
  return cachedValue(cacheKey, CACHE_TTLS.vendors, async () => {
    const response = await meritRequest<unknown>(
      "getvendors",
      credentials,
      queryBody,
    );
    const vendors = extractList(response)
      .map(normalizeVendor)
      .filter(isNonNull);
    return vendors[0] ?? null;
  });
}

export async function createVendor(
  credentials: MeritCredentials,
  vendor: MeritVendor,
): Promise<MeritVendor> {
  const response = await meritRequest<Record<string, unknown>>(
    "sendvendor",
    credentials,
    {
      Name: vendor.name,
      RegNo: vendor.regNo ?? undefined,
      VatAccountable: Boolean(vendor.vatRegNo),
      VatRegNo: vendor.vatRegNo ?? undefined,
      CurrencyCode: "EUR",
      Address: vendor.address ?? undefined,
      City: vendor.city ?? undefined,
      County: vendor.county ?? undefined,
      PostalCode: vendor.postalCode ?? undefined,
      CountryCode: vendor.countryCode ?? "EE",
      PhoneNo: vendor.phoneNo ?? undefined,
      Email: vendor.email ?? undefined,
      VendorType: 1,
      ReceiverName: vendor.name,
      BankAccount: vendor.bankAccount ?? undefined,
    },
  );

  const createdVendor = buildCreatedVendor(vendor, response);

  for (const searchBody of vendorSearchBodies(vendor)) {
    setCachedValue(
      namespacedCacheKey(credentials, `vendor:${JSON.stringify(searchBody)}`),
      CACHE_TTLS.vendors,
      createdVendor,
    );
  }

  return createdVendor;
}

function buildCreatedVendor(
  vendor: MeritVendor,
  response: Record<string, unknown>,
): MeritVendor {
  return {
    id: toOptionalString(response.Id),
    name: toOptionalString(response.Name) ?? vendor.name,
    regNo: vendor.regNo,
    vatRegNo: vendor.vatRegNo,
    bankAccount: vendor.bankAccount,
    referenceNo: vendor.referenceNo,
    address: vendor.address,
    city: vendor.city,
    county: vendor.county,
    postalCode: vendor.postalCode,
    countryCode: vendor.countryCode,
    email: vendor.email,
    phoneNo: vendor.phoneNo,
  };
}

function vendorSearchBodies(
  vendor: MeritVendor,
): Array<Record<string, unknown>> {
  const searchBodies: Array<Record<string, unknown>> = [];

  if (vendor.regNo) {
    searchBodies.push({ RegNo: vendor.regNo });
  }
  if (vendor.vatRegNo) {
    searchBodies.push({ VatRegNo: vendor.vatRegNo });
  }
  if (vendor.name) {
    searchBodies.push({ Name: vendor.name });
  }

  return searchBodies;
}

function normalizeItemResponse(item: MeritItem): ProviderCatalogArticle | null {
  const code = item.code;
  const description = item.description;
  if (!code || !description) {
    return null;
  }

  return {
    code,
    description,
    unit: item.unit,
    purchaseAccountCode: item.purchaseAccountCode,
    taxCode: item.taxId,
    type: item.type ? String(item.type) : undefined,
    activePurchase:
      item.usage === undefined || item.usage === 2 || item.usage === 3,
  };
}

export async function listItems(
  credentials: MeritCredentials,
): Promise<ProviderCatalogArticle[]> {
  const items = await getItems(credentials);
  return items.map(normalizeItemResponse).filter(isNonNull);
}

export async function createItem(
  credentials: MeritCredentials,
  item: {
    code: string;
    description: string;
    unit?: string;
    purchaseAccountCode?: string;
    taxCode?: string;
    type?: string;
  },
): Promise<ProviderCatalogArticle> {
  const response = await meritRequest<unknown>("senditems", credentials, {
    Items: [
      {
        Type: Number(item.type ?? "2"),
        Usage: 2,
        Code: item.code,
        Description: item.description,
        UOMName: item.unit || undefined,
        TaxId: item.taxCode || undefined,
        PurchaseAccCode: item.purchaseAccountCode || undefined,
      },
    ],
  });
  clearCachedValuesByPrefix(namespacedCacheKey(credentials, "items"));
  const created = extractList(response)[0];
  const code = toOptionalString(created?.Code) ?? item.code;
  return {
    code,
    description: item.description,
    unit: item.unit,
    purchaseAccountCode: item.purchaseAccountCode,
    taxCode: item.taxCode,
    type: item.type,
    activePurchase: true,
  };
}

const MAX_MERIT_LOOKBACK_DAYS = 89;

function invoiceWindowForExtraction(
  extraction: FindExistingInvoiceParams["extraction"],
) {
  const baseDate =
    extraction.invoice.issueDate ??
    extraction.invoice.entryDate ??
    new Date().toISOString().slice(0, 10);
  const parsedBaseDate = new Date(baseDate);
  const start = Number.isNaN(parsedBaseDate.getTime())
    ? new Date()
    : new Date(
        parsedBaseDate.getTime() -
          MAX_MERIT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );
  const end = Number.isNaN(parsedBaseDate.getTime())
    ? new Date()
    : new Date(parsedBaseDate.getTime());

  return {
    PeriodStart: meritDate(start.toISOString()),
    PeriodEnd: meritDate(end.toISOString()),
    DateType: 0,
  };
}

export async function getVendorInvoiceHistory(
  credentials: MeritCredentials,
  params: {
    vendorId: string;
    extraction: FindExistingInvoiceParams["extraction"];
  },
): Promise<ProviderHistoricalInvoiceRow[]> {
  const body = invoiceWindowForExtraction(params.extraction);
  const cacheKey = namespacedCacheKey(
    credentials,
    `purchaseInvoices:${JSON.stringify(body)}`,
  );
  const invoices = await cachedValue(
    cacheKey,
    CACHE_TTLS.purchaseInvoices,
    async () => {
      const response = await meritRequest<unknown>(
        "getpurchorders",
        credentials,
        body,
      );
      return extractList(response);
    },
  );

  return invoices
    .filter((invoice) => toOptionalString(invoice.VendorId) === params.vendorId)
    .flatMap((invoice) => {
      const vendorId = toOptionalString(invoice.VendorId);
      const vendorName = toOptionalString(invoice.VendorName ?? invoice.Name);
      const invoiceId = toOptionalString(invoice.PIHId ?? invoice.Id);
      if (!vendorId || !vendorName || !invoiceId) {
        return [];
      }

      const rows = Array.isArray(invoice.InvoiceRow) ? invoice.InvoiceRow : [];
      return rows
        .map((row) => {
          const record =
            row !== null && typeof row === "object"
              ? (row as Record<string, unknown>)
              : null;
          if (!record) {
            return null;
          }

          const item =
            record.Item !== null && typeof record.Item === "object"
              ? (record.Item as Record<string, unknown>)
              : null;
          const articleCode = toOptionalString(item?.Code);
          const description =
            toOptionalString(record.Description) ??
            toOptionalString(item?.Description);
          if (!articleCode || !description) {
            return null;
          }

          return {
            invoiceId,
            invoiceNumber: toOptionalString(invoice.BillNo),
            issueDate:
              toOptionalString(invoice.DocDate) ??
              toOptionalString(invoice.TransactionDate),
            vendorId,
            vendorName,
            sourceArticleCode: articleCode,
            description,
            articleCode,
            articleDescription: toOptionalString(item?.Description),
            purchaseAccountCode:
              toOptionalString(record.PurchaseAccCode) ??
              toOptionalString(record.GLAccountCode),
            taxCode: toOptionalString(record.TaxId),
            unit: toOptionalString(item?.UOMName),
          } satisfies ProviderHistoricalInvoiceRow;
        })
        .filter(isNonNull);
    });
}

export async function findExistingPurchaseInvoice(
  credentials: MeritCredentials,
  params: FindExistingInvoiceParams,
): Promise<{ invoiceId: string } | null> {
  const body = invoiceWindowForExtraction(params.extraction);
  const cacheKey = namespacedCacheKey(
    credentials,
    `purchaseInvoices:${JSON.stringify(body)}`,
  );
  const invoices = await cachedValue(
    cacheKey,
    CACHE_TTLS.purchaseInvoices,
    async () => {
      const response = await meritRequest<unknown>(
        "getpurchorders",
        credentials,
        body,
      );
      return extractList(response);
    },
  );

  const match = invoices.find((invoice) => {
    const billNo = toOptionalString(invoice.BillNo);
    const vendorId = toOptionalString(invoice.VendorId);
    return (
      billNo === params.invoiceNumber &&
      (!params.vendorId || vendorId === params.vendorId)
    );
  });

  const invoiceId = match ? toOptionalString(match.PIHId) : undefined;
  return invoiceId ? { invoiceId } : null;
}
