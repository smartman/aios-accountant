import type { InvoiceExtraction } from "./invoice-import-types";
import { normalizeInvoiceExtraction } from "./invoice-import/normalization";
import {
  shouldRepairMergedInvoiceRows,
  shouldUseSeparatedRows,
} from "./invoice-import/row-repair";
import type {
  AccountingProvider,
  ProviderDimension,
  ProviderReferenceAccount,
  ProviderReferenceTaxCode,
} from "./accounting-provider-types";
import {
  buildOpenAIContent,
  jsonSchemaForInvoiceExtraction,
  jsonSchemaForInvoiceRows,
  requestOpenAIStructuredOutput,
} from "./openai-client";
import {
  buildRowRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from "./openai-prompts";

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.5";
}

function normalizeVendor(data: InvoiceExtraction): InvoiceExtraction["vendor"] {
  return {
    name: data.vendor.name ?? null,
    regCode: data.vendor.regCode ?? null,
    vatNumber: data.vendor.vatNumber ?? null,
    bankAccount: data.vendor.bankAccount ?? null,
    email: data.vendor.email ?? null,
    phone: data.vendor.phone ?? null,
    countryCode: data.vendor.countryCode
      ? data.vendor.countryCode.toUpperCase()
      : null,
    city: data.vendor.city ?? null,
    postalCode: data.vendor.postalCode ?? null,
    addressLine1: data.vendor.addressLine1 ?? null,
    addressLine2: data.vendor.addressLine2 ?? null,
  };
}

function normalizeInvoice(
  data: InvoiceExtraction,
): InvoiceExtraction["invoice"] {
  return {
    documentType: data.invoice.documentType ?? null,
    invoiceNumber: data.invoice.invoiceNumber ?? null,
    referenceNumber: data.invoice.referenceNumber ?? null,
    currency: data.invoice.currency
      ? data.invoice.currency.toUpperCase()
      : "EUR",
    issueDate: data.invoice.issueDate ?? null,
    dueDate: data.invoice.dueDate ?? null,
    entryDate: data.invoice.entryDate ?? data.invoice.issueDate ?? null,
    amountExcludingVat: data.invoice.amountExcludingVat ?? null,
    vatAmount: data.invoice.vatAmount ?? null,
    totalAmount: data.invoice.totalAmount ?? null,
    roundingAmount: data.invoice.roundingAmount ?? null,
    notes: data.invoice.notes ?? null,
  };
}

function normalizePayment(
  data: InvoiceExtraction,
): InvoiceExtraction["payment"] {
  return {
    isPaid: Boolean(data.payment.isPaid),
    paymentDate: data.payment.paymentDate ?? null,
    paymentAmount: data.payment.paymentAmount ?? null,
    paymentChannelHint: data.payment.paymentChannelHint ?? null,
    reason: data.payment.reason ?? null,
  };
}

function normalizeDimension(
  data: InvoiceExtraction,
): NonNullable<InvoiceExtraction["dimension"]> {
  return {
    code: data.dimension?.code ?? null,
    name: data.dimension?.name ?? null,
    reason: data.dimension?.reason ?? null,
  };
}

function normalizeRows(data: InvoiceExtraction): InvoiceExtraction["rows"] {
  if (!Array.isArray(data.rows)) {
    return [];
  }

  return data.rows.map((row) => {
    const manualReviewReason = row.manualReviewReason?.trim() || null;

    return {
      ...row,
      needsManualReview: Boolean(row.needsManualReview || manualReviewReason),
      manualReviewReason,
    };
  });
}

function normalizeWarnings(
  data: InvoiceExtraction,
): InvoiceExtraction["warnings"] {
  return Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
}

function normalizeExtraction(data: InvoiceExtraction): InvoiceExtraction {
  return normalizeInvoiceExtraction({
    vendor: normalizeVendor(data),
    invoice: normalizeInvoice(data),
    payment: normalizePayment(data),
    dimension: normalizeDimension(data),
    rows: normalizeRows(data),
    warnings: normalizeWarnings(data),
  });
}

export async function extractInvoiceWithOpenAI(params: {
  provider: AccountingProvider;
  filename: string;
  mimeType: string;
  fileDataUrl: string;
  accounts: ProviderReferenceAccount[];
  taxCodes: ProviderReferenceTaxCode[];
  dimensions?: ProviderDimension[];
  companyContext?: string | null;
}): Promise<InvoiceExtraction> {
  const apiKey = assertEnv("OPENAI_API_KEY");
  const model = getOpenAIModel();
  const systemPrompt = buildSystemPrompt();
  const parsed = await requestOpenAIStructuredOutput<InvoiceExtraction>({
    apiKey,
    model,
    systemPrompt,
    userContent: buildOpenAIContent({
      mimeType: params.mimeType,
      filename: params.filename,
      fileDataUrl: params.fileDataUrl,
      promptText: buildUserPrompt(
        params.provider,
        params.accounts,
        params.taxCodes,
        params.dimensions ?? [],
        params.companyContext,
      ),
    }),
    jsonSchema: jsonSchemaForInvoiceExtraction(),
    promptCacheKey: "invoice-extraction",
    reasoningEffort: "low",
    invalidJsonMessage:
      "OpenAI did not return valid JSON for the invoice extraction.",
  });
  const extraction = normalizeExtraction(parsed);

  if (!shouldRepairMergedInvoiceRows(extraction)) {
    return extraction;
  }

  try {
    const repairedRowsPayload = await requestOpenAIStructuredOutput<{
      rows?: InvoiceExtraction["rows"];
    }>({
      apiKey,
      model,
      systemPrompt,
      userContent: buildOpenAIContent({
        mimeType: params.mimeType,
        filename: params.filename,
        fileDataUrl: params.fileDataUrl,
        promptText: buildRowRepairPrompt(
          params.provider,
          extraction,
          params.accounts,
          params.taxCodes,
          params.dimensions ?? [],
          params.companyContext,
        ),
      }),
      jsonSchema: jsonSchemaForInvoiceRows(),
      promptCacheKey: "invoice-row-repair",
      reasoningEffort: "low",
      invalidJsonMessage:
        "OpenAI did not return valid JSON for the invoice row repair.",
    });
    const repairedRows = repairedRowsPayload.rows ?? [];

    if (!shouldUseSeparatedRows(extraction, repairedRows)) {
      return extraction;
    }

    return normalizeExtraction({
      ...extraction,
      rows: repairedRows,
    });
  } catch {
    return extraction;
  }
}

export const __test__ = {
  buildSystemPrompt,
  buildRowRepairPrompt,
  buildUserPrompt,
};
