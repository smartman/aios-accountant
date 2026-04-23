import {
  FindExistingInvoiceParams,
  MeritCredentials,
} from "../../accounting-provider-types";
import { ProviderHistoricalInvoiceRow } from "../../accounting-provider-activities";
import {
  CACHE_TTLS,
  cachedValue,
  extractList,
  isNonNull,
  meritDate,
  meritRequest,
  namespacedCacheKey,
  toOptionalString,
} from "./core";

const MAX_MERIT_LOOKBACK_DAYS = 89;

interface NormalizedHistoryHeader {
  detailRecord: Record<string, unknown> | null;
  invoiceId?: string;
  invoiceNumber?: string;
  issueDate?: string;
  vendorId?: string;
  vendorName?: string;
}

interface ResolvedHistoryHeader extends NormalizedHistoryHeader {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function pickOptionalString(values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = toOptionalString(value);
    if (stringValue) {
      return stringValue;
    }
  }

  return undefined;
}

export function invoiceWindowForExtraction(
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

export async function loadPurchaseInvoiceHeaders(
  credentials: MeritCredentials,
  body: ReturnType<typeof invoiceWindowForExtraction>,
) {
  const cacheKey = namespacedCacheKey(
    credentials,
    `purchaseInvoices:${JSON.stringify(body)}`,
  );
  return cachedValue(cacheKey, CACHE_TTLS.purchaseInvoices, async () => {
    const response = await meritRequest<unknown>(
      "getpurchorders",
      credentials,
      body,
    );
    return extractList(response);
  });
}

function getMatchingPurchaseInvoiceIds(
  invoices: Record<string, unknown>[],
  vendorId: string,
): string[] {
  return invoices
    .filter((invoice) => toOptionalString(invoice.VendorId) === vendorId)
    .map((invoice) => toOptionalString(invoice.PIHId ?? invoice.Id))
    .filter(isNonNull);
}

async function loadPurchaseInvoiceDetails(
  credentials: MeritCredentials,
  invoiceId: string,
) {
  const cacheKey = namespacedCacheKey(
    credentials,
    `purchaseInvoice:${invoiceId}`,
  );
  return cachedValue(cacheKey, CACHE_TTLS.purchaseInvoices, async () =>
    meritRequest<unknown>("getpurchorder", credentials, {
      Id: invoiceId,
      SkipAttachment: true,
    }),
  );
}

function resolveHistoryHeaderRecord(params: {
  invoice: Record<string, unknown>;
  details: unknown;
}): {
  detailRecord: Record<string, unknown> | null;
  headerRecord: Record<string, unknown>;
} {
  const detailRecord = toRecord(params.details);
  return {
    detailRecord,
    headerRecord: toRecord(detailRecord?.Header) ?? params.invoice,
  };
}

function normalizeHistoryHeader(params: {
  invoice: Record<string, unknown>;
  details: unknown;
}): NormalizedHistoryHeader {
  const { detailRecord, headerRecord } = resolveHistoryHeaderRecord(params);

  return {
    detailRecord,
    invoiceId: pickOptionalString([
      headerRecord.PIHId,
      headerRecord.Id,
      params.invoice.PIHId,
      params.invoice.Id,
    ]),
    invoiceNumber: pickOptionalString([
      headerRecord.BillNo,
      headerRecord.InvoiceNo,
      params.invoice.BillNo,
    ]),
    issueDate: pickOptionalString([
      headerRecord.DocumentDate,
      headerRecord.DocDate,
      headerRecord.TransactionDate,
      params.invoice.DocDate,
      params.invoice.TransactionDate,
    ]),
    vendorId: pickOptionalString([
      headerRecord.VendorId,
      params.invoice.VendorId,
    ]),
    vendorName: pickOptionalString([
      headerRecord.VendorName,
      headerRecord.Name,
      params.invoice.VendorName,
    ]),
  };
}

function resolveHistoryHeader(
  header: NormalizedHistoryHeader,
): ResolvedHistoryHeader | null {
  if (!header.invoiceId || !header.vendorId || !header.vendorName) {
    return null;
  }

  return {
    ...header,
    invoiceId: header.invoiceId,
    vendorId: header.vendorId,
    vendorName: header.vendorName,
  };
}

function getHistoryArticleCode(
  record: Record<string, unknown>,
  item: Record<string, unknown> | null,
) {
  return pickOptionalString([record.ArticleCode, item?.Code]);
}

function getHistoryDescription(
  record: Record<string, unknown>,
  item: Record<string, unknown> | null,
) {
  return pickOptionalString([record.Description, item?.Description]);
}

function getHistoryPurchaseAccountCode(record: Record<string, unknown>) {
  return pickOptionalString([
    record.AccountCode,
    record.PurchaseAccCode,
    record.GLAccountCode,
  ]);
}

function getHistoryTaxCode(record: Record<string, unknown>) {
  return pickOptionalString([record.TaxId, record.TaxName]);
}

function getHistoryUnit(
  record: Record<string, unknown>,
  item: Record<string, unknown> | null,
) {
  return pickOptionalString([
    record.UOMName,
    record.UnitofMeasure,
    item?.UOMName,
  ]);
}

function normalizeHistoryRow(params: {
  row: unknown;
  header: ResolvedHistoryHeader;
}): ProviderHistoricalInvoiceRow | null {
  const record = toRecord(params.row);
  if (!record) {
    return null;
  }

  const item = toRecord(record.Item);
  const articleCode = getHistoryArticleCode(record, item);
  const description = getHistoryDescription(record, item);
  if (!articleCode || !description) {
    return null;
  }

  return {
    invoiceId: params.header.invoiceId,
    invoiceNumber: params.header.invoiceNumber,
    issueDate: params.header.issueDate,
    vendorId: params.header.vendorId,
    vendorName: params.header.vendorName,
    description,
    articleCode,
    articleDescription: description,
    purchaseAccountCode: getHistoryPurchaseAccountCode(record),
    taxCode: getHistoryTaxCode(record),
    unit: getHistoryUnit(record, item),
  };
}

function normalizeHistoryRows(params: {
  invoice: Record<string, unknown>;
  details: unknown;
}): ProviderHistoricalInvoiceRow[] {
  const header = resolveHistoryHeader(normalizeHistoryHeader(params));
  if (!header) {
    return [];
  }

  const rows = Array.isArray(header.detailRecord?.Lines)
    ? header.detailRecord.Lines
    : Array.isArray(params.invoice.InvoiceRow)
      ? params.invoice.InvoiceRow
      : [];

  return rows
    .map((row) =>
      normalizeHistoryRow({
        row,
        header,
      }),
    )
    .filter(isNonNull);
}

export async function getVendorInvoiceHistory(
  credentials: MeritCredentials,
  params: {
    vendorId: string;
    extraction: FindExistingInvoiceParams["extraction"];
  },
): Promise<ProviderHistoricalInvoiceRow[]> {
  const body = invoiceWindowForExtraction(params.extraction);
  const invoices = await loadPurchaseInvoiceHeaders(credentials, body);
  const invoiceIds = getMatchingPurchaseInvoiceIds(invoices, params.vendorId);
  const detailedInvoices = await Promise.all(
    invoiceIds.map(async (invoiceId) => ({
      details: await loadPurchaseInvoiceDetails(credentials, invoiceId),
      invoice:
        invoices.find(
          (candidate) =>
            toOptionalString(candidate.PIHId ?? candidate.Id) === invoiceId,
        ) ?? {},
    })),
  );

  return detailedInvoices.flatMap((entry) => normalizeHistoryRows(entry));
}
