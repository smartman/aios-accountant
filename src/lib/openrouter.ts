import { InvoiceExtraction } from "./invoice-import-types";
import {
  AccountingProvider,
  ProviderReferenceAccount,
  ProviderReferenceTaxCode,
} from "./accounting-provider-types";

type OpenRouterMessageContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      file: {
        filename: string;
        file_data: string;
      };
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const VENDOR_PROPERTIES = {
  name: { type: ["string", "null"] },
  regCode: { type: ["string", "null"] },
  vatNumber: { type: ["string", "null"] },
  bankAccount: { type: ["string", "null"] },
  email: { type: ["string", "null"] },
  phone: { type: ["string", "null"] },
  countryCode: { type: ["string", "null"] },
  city: { type: ["string", "null"] },
  postalCode: { type: ["string", "null"] },
  addressLine1: { type: ["string", "null"] },
  addressLine2: { type: ["string", "null"] },
} as const;

const INVOICE_PROPERTIES = {
  documentType: { type: ["string", "null"] },
  invoiceNumber: { type: ["string", "null"] },
  referenceNumber: { type: ["string", "null"] },
  currency: { type: ["string", "null"] },
  issueDate: { type: ["string", "null"] },
  dueDate: { type: ["string", "null"] },
  entryDate: { type: ["string", "null"] },
  amountExcludingVat: { type: ["number", "null"] },
  vatAmount: { type: ["number", "null"] },
  totalAmount: { type: ["number", "null"] },
  notes: { type: ["string", "null"] },
} as const;

const PAYMENT_PROPERTIES = {
  isPaid: { type: "boolean" },
  paymentDate: { type: ["string", "null"] },
  paymentAmount: { type: ["number", "null"] },
  paymentChannelHint: {
    type: ["string", "null"],
    enum: ["BANK", "CASH", null],
  },
  reason: { type: ["string", "null"] },
} as const;

const ROW_PROPERTIES = {
  description: { type: "string" },
  quantity: { type: ["number", "null"] },
  unit: { type: ["string", "null"] },
  price: { type: ["number", "null"] },
  sum: { type: ["number", "null"] },
  vatRate: { type: ["number", "null"] },
  vatPc: { type: ["string", "null"] },
  accountPurchase: { type: ["string", "null"] },
  accountSelectionReason: { type: "string" },
} as const;

const INVOICE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "invoice", "payment", "rows", "warnings"],
  properties: {
    vendor: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(VENDOR_PROPERTIES),
      properties: VENDOR_PROPERTIES,
    },
    invoice: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(INVOICE_PROPERTIES),
      properties: INVOICE_PROPERTIES,
    },
    payment: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(PAYMENT_PROPERTIES),
      properties: PAYMENT_PROPERTIES,
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(ROW_PROPERTIES),
        properties: ROW_PROPERTIES,
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

function jsonSchemaForInvoiceExtraction() {
  return {
    name: "invoice_import_payload",
    strict: true,
    schema: INVOICE_EXTRACTION_SCHEMA,
  };
}

function buildSystemPrompt(): string {
  return [
    "You extract structured data from purchase invoices for accounting imports.",
    "The vendor is the supplier, seller, service provider, or invoice issuer that billed the customer.",
    "Never use the invoice recipient, buyer, customer, subscriber, or bill-to entity as the vendor.",
    "Determine vendor and customer from explicit role labels before using header branding or company logos.",
    "Labels such as Arve saaja, Saaja, Ostja, Tellija, Klient, Buyer, Bill to, Invoice recipient, Recipient, and Customer refer to the buyer or invoice recipient, not the vendor.",
    "Labels such as Tarnija, Supplier, Seller, Issuer, From, Payee, and Makse saaja refer to the vendor or payment recipient.",
    "Use the PDF's visual layout when resolving party roles. Bind each label to the nearest company block in the same visual group, column, or side of the page.",
    "Do not rely on flattened reading order when it conflicts with the visible PDF layout.",
    "Do not treat top-of-page branding as the vendor by default. Use branding only as fallback evidence when explicit role labels are missing.",
    "Cross-check the payment direction: the payment recipient or payee is usually the vendor, while the invoice recipient or bill-to party is the customer.",
    "If role evidence conflicts, prefer the clearest labeled role assignment, leave uncertain fields null, and explain the ambiguity in warnings.",
    "Return only data grounded in the document.",
  ].join("\n");
}

function buildUserPrompt(
  provider: AccountingProvider,
  accounts: ProviderReferenceAccount[],
  taxCodes: ProviderReferenceTaxCode[],
): string {
  const simplifiedAccounts = accounts.map((account) => ({
    code: account.code,
    type: account.type ?? null,
    label: account.label,
  }));
  const simplifiedTaxCodes = taxCodes.map((taxCode) => ({
    code: taxCode.code,
    percent: taxCode.rate ?? null,
    description: taxCode.description ?? null,
    purchaseAccountCode: taxCode.purchaseAccountCode ?? null,
  }));
  const providerLabel =
    provider === "smartaccounts" ? "SmartAccounts" : "Merit";

  return [
    `Return only structured accounting data for importing a purchase invoice into ${providerLabel}.`,
    "Vendor extraction is the top priority: vendor.* must describe the supplier or issuer, never the buyer.",
    "For Estonian invoices, Arve saaja is the invoice recipient and Makse saaja is the payee or payment recipient. Do not copy Arve saaja details into vendor fields.",
    "For multi-column or visually grouped PDFs, keep labels matched with the nearest company details in the same block or column.",
    "If explicit role labels and header branding disagree, prefer the explicit labeled roles and mention the conflict in warnings.",
    "Use ISO date format YYYY-MM-DD for every date.",
    "Use one of the provided account codes for each row's accountPurchase.",
    "Only choose purchase posting accounts that fit the invoice content. Do not use bank, cash, receivable, payable, or VAT settlement accounts unless the invoice clearly represents such a purchase.",
    "Prefer the most specific matching account description over generic catch-all accounts when a better fit exists.",
    "For internal equipment and hardware purchases such as monitors, computers, docks, stands, adapters, and other IT accessories, prefer computer, IT, equipment, or low-value-asset accounts when available.",
    "Use inventory or goods-for-resale accounts only when the document clearly indicates the purchase is for resale or stock.",
    "Use one of the provided tax codes when you can determine it from the document. If unclear, return null.",
    "Set payment.isPaid = true only when the document clearly shows it is already paid or is a receipt-like fully paid document.",
    "payment.paymentChannelHint should be BANK for transfers/cards and CASH for cash receipts when reasonably clear; otherwise null.",
    "If the invoice has multiple meaningful rows, return them. If not, return one summarized row.",
    "If something is unclear, keep fields null and add a warning.",
    `Available purchase accounts: ${JSON.stringify(simplifiedAccounts)}`,
    `Available tax codes: ${JSON.stringify(simplifiedTaxCodes)}`,
  ].join("\n");
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }

  return "";
}

function buildOpenRouterContent(params: {
  provider: AccountingProvider;
  mimeType: string;
  filename: string;
  fileDataUrl: string;
  accounts: ProviderReferenceAccount[];
  taxCodes: ProviderReferenceTaxCode[];
}): OpenRouterMessageContent[] {
  const content: OpenRouterMessageContent[] = [
    {
      type: "text",
      text: buildUserPrompt(params.provider, params.accounts, params.taxCodes),
    },
  ];

  if (params.mimeType.startsWith("image/")) {
    content.push({
      type: "image_url",
      image_url: {
        url: params.fileDataUrl,
      },
    });
    return content;
  }

  content.push({
    type: "file",
    file: {
      filename: params.filename,
      file_data: params.fileDataUrl,
    },
  });

  return content;
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

function normalizeRows(data: InvoiceExtraction): InvoiceExtraction["rows"] {
  return Array.isArray(data.rows) ? data.rows : [];
}

function normalizeWarnings(
  data: InvoiceExtraction,
): InvoiceExtraction["warnings"] {
  return Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
}

function normalizeExtraction(data: InvoiceExtraction): InvoiceExtraction {
  return {
    vendor: normalizeVendor(data),
    invoice: normalizeInvoice(data),
    payment: normalizePayment(data),
    rows: normalizeRows(data),
    warnings: normalizeWarnings(data),
  };
}

export async function extractInvoiceWithOpenRouter(params: {
  provider: AccountingProvider;
  filename: string;
  mimeType: string;
  fileDataUrl: string;
  accounts: ProviderReferenceAccount[];
  taxCodes: ProviderReferenceTaxCode[];
}): Promise<InvoiceExtraction> {
  const apiKey = assertEnv("OPENROUTER_API_KEY");
  const model = assertEnv("OPENROUTER_MODEL");
  const content = buildOpenRouterContent(params);

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title":
          process.env.OPENROUTER_APP_TITLE ?? "Accounting Invoice Importer",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: jsonSchemaForInvoiceExtraction(),
        },
        temperature: 0.1,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenRouter ${response.status}: ${text || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content;
  const text = extractMessageText(rawContent);
  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  let parsed: InvoiceExtraction;
  try {
    parsed = JSON.parse(text) as InvoiceExtraction;
  } catch {
    throw new Error(
      "OpenRouter did not return valid JSON for the invoice extraction.",
    );
  }

  return normalizeExtraction(parsed);
}

export const __test__ = {
  buildSystemPrompt,
  buildUserPrompt,
};
