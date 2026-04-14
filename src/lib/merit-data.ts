import {
  FindExistingInvoiceParams,
  MeritCredentials,
  MeritVendor,
} from "./accounting-provider-types";
import {
  CACHE_TTLS,
  cachedValue,
  extractList,
  meritDate,
  meritRequest,
  namespacedCacheKey,
  setCachedValue,
  toOptionalString,
  isNonNull,
} from "./merit-core";

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

export async function findExistingPurchaseInvoice(
  credentials: MeritCredentials,
  params: FindExistingInvoiceParams,
): Promise<{ invoiceId: string } | null> {
  const baseDate =
    params.extraction.invoice.issueDate ??
    params.extraction.invoice.entryDate ??
    new Date().toISOString().slice(0, 10);
  const parsedBaseDate = new Date(baseDate);
  const start = Number.isNaN(parsedBaseDate.getTime())
    ? new Date()
    : new Date(parsedBaseDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = Number.isNaN(parsedBaseDate.getTime())
    ? new Date()
    : new Date(parsedBaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const body = {
    PeriodStart: meritDate(start.toISOString()),
    PeriodEnd: meritDate(end.toISOString()),
    DateType: 0,
  };
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
