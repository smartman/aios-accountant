import type { InvoiceExtraction } from "./invoice-import-types";
import type {
  AccountingProvider,
  ProviderDimension,
  ProviderReferenceAccount,
  ProviderReferenceTaxCode,
} from "./accounting-provider-types";

function simplifyAccounts(accounts: ProviderReferenceAccount[]) {
  return accounts.map((account) => ({
    code: account.code,
    type: account.type ?? null,
    label: account.label,
  }));
}

function simplifyTaxCodes(taxCodes: ProviderReferenceTaxCode[]) {
  return taxCodes.map((taxCode) => ({
    code: taxCode.code,
    percent: taxCode.rate ?? null,
    description: taxCode.description ?? null,
    purchaseAccountCode: taxCode.purchaseAccountCode ?? null,
  }));
}

function simplifyDimensions(dimensions: ProviderDimension[]) {
  return dimensions.map((dimension) => ({
    code: dimension.code,
    name: dimension.name,
  }));
}

function getProviderLabel(provider: AccountingProvider): string {
  return provider === "smartaccounts" ? "SmartAccounts" : "Merit";
}

export function buildSystemPrompt(): string {
  return [
    "You extract structured data from purchase invoices for accounting imports.",
    "The vendor is the supplier, seller, service provider, or invoice issuer that billed the customer.",
    "Never use the invoice recipient, buyer, customer, subscriber, or bill-to entity as the vendor.",
    "Determine vendor and customer from explicit role labels before using header branding or company logos.",
    "Labels such as Arve saaja, Saaja, Ostja, Tellija, Klient, Buyer, Bill to, Invoice recipient, Recipient, and Customer refer to the buyer or invoice recipient, not the vendor.",
    "Labels such as Tarnija, Supplier, Seller, Issuer, From, Payee, and Makse saaja refer to the vendor or payment recipient.",
    "Use the uploaded document's visual layout when resolving party roles. Bind each label to the nearest company block in the same visual group, column, or side of the page.",
    "For photographed receipts or invoices, mentally correct rotation, perspective skew, folds, shadows, glare, and low contrast before reading the text.",
    "Do not rely on flattened reading order when it conflicts with the visible document layout.",
    "Do not treat top-of-page branding as the vendor by default. Use branding only as fallback evidence when explicit role labels are missing.",
    "Cross-check the payment direction: the payment recipient or payee is usually the vendor, while the invoice recipient or bill-to party is the customer.",
    "If role evidence conflicts, prefer the clearest labeled role assignment, leave uncertain fields null, and explain only unresolved ambiguity in warnings.",
    "Do not add a warning when the vendor is confidently resolved from explicit role labels.",
    "Return only data grounded in the document.",
  ].join("\n");
}

export function buildUserPrompt(
  provider: AccountingProvider,
  accounts: ProviderReferenceAccount[],
  taxCodes: ProviderReferenceTaxCode[],
  dimensions: ProviderDimension[] = [],
  companyContext?: string | null,
): string {
  const prompt = [
    `Return only structured accounting data for importing a purchase invoice into ${getProviderLabel(provider)}.`,
    companyContext?.trim() ? companyContext.trim() : null,
    "Vendor extraction is the top priority: vendor.* must describe the supplier or issuer, never the buyer.",
    "For Estonian invoices, Arve saaja is the invoice recipient and Makse saaja is the payee or payment recipient. Do not copy Arve saaja details into vendor fields.",
    "For multi-column, visually grouped, or photographed documents, keep labels matched with the nearest company details in the same block or column.",
    "If explicit role labels and header branding disagree, prefer the explicit labeled roles and mention the conflict in warnings.",
    "Use ISO date format YYYY-MM-DD for every date.",
    "Use one of the provided account codes for each row's accountPurchase.",
    "Only choose purchase posting accounts that fit the invoice content. Do not use bank, cash, receivable, payable, or VAT settlement accounts unless the invoice clearly represents such a purchase.",
    "Prefer the most specific matching account description over generic catch-all accounts when a better fit exists.",
    "For internal equipment and hardware purchases such as monitors, computers, docks, stands, adapters, and other IT accessories, prefer computer, IT, equipment, or low-value-asset accounts when available.",
    "Use inventory or goods-for-resale accounts only when the document clearly indicates the purchase is for resale or stock.",
    "Use one of the provided tax codes when you can determine it from the document. If unclear, return null.",
    "Set payment.isPaid = true only when the document clearly shows it is already paid or is a receipt-like fully paid document.",
    "Infer payment.paymentChannelHint only from the customer's payment method shown on the document: BANK for transfers/cards, CASH for cash receipts, otherwise null.",
    "Never combine separate visible invoice rows into one extracted row.",
    "If the document table shows five line items, return five rows in the same order.",
    "Do not summarize rows by service family, month, or tax rate when the source document shows separate lines.",
    "Only return one summarized row when the document truly has just one meaningful purchase row.",
    "For receipts and cash-register slips, each printed item line with its own amount is a separate row; return explicit discount lines as negative rows.",
    "If a retail receipt prints VAT-inclusive item amounts and also states a separate net total and VAT total, return row price and sum as VAT-exclusive net amounts so rows reconcile to invoice.amountExcludingVat.",
    "When a row shows quantity, a rounded unit price, and a separate VAT-exclusive row total, copy that exact row total into sum and do not recompute it from price times quantity.",
    "For every row, set needsManualReview=true when any row text, source code, quantity, unit, amount, VAT, account classification, or discount treatment is uncertain, partially unreadable, inferred from context, or does not reconcile. Put a concise reason in manualReviewReason.",
    "Set needsManualReview=false and manualReviewReason=null only when the row is clearly read and reconciles with the document totals.",
    "If the invoice total includes an explicit rounding amount, return it in invoice.roundingAmount, keep amountExcludingVat and vatAmount as stated, and set totalAmount to the final payable amount after rounding.",
    "If a supplier-specific product or article code is shown on a row, return it as sourceArticleCode. This is source evidence only, not the accounting item code.",
    "Set dimension.code only when a provided project/dimension rule clearly matches the invoice. Otherwise return null dimension fields.",
    "Return monetary amounts exactly as shown in the document. Do not round or normalize them.",
    "Do not put rounding information into invoice.notes when it belongs in invoice.roundingAmount.",
    "If something is unclear, keep fields null and add a warning.",
    `Available purchase accounts: ${JSON.stringify(simplifyAccounts(accounts))}`,
    `Available tax codes: ${JSON.stringify(simplifyTaxCodes(taxCodes))}`,
    `Available dimensions/objects: ${JSON.stringify(simplifyDimensions(dimensions))}`,
  ].filter(Boolean);

  return prompt.join("\n");
}

export function buildRowRepairPrompt(
  provider: AccountingProvider,
  extraction: InvoiceExtraction,
  accounts: ProviderReferenceAccount[],
  taxCodes: ProviderReferenceTaxCode[],
  dimensions: ProviderDimension[] = [],
  companyContext?: string | null,
): string {
  return [
    `Re-read the attached ${getProviderLabel(provider)} purchase invoice and return only the purchase rows.`,
    companyContext?.trim() ? companyContext.trim() : null,
    "The previous extraction likely summarized several visible invoice rows into one row.",
    "Never combine separate source rows into one output row.",
    "Preserve the row order from the document table.",
    "Descriptions that share the same month, service family, or tax rate still belong on separate rows when they appear on separate source lines.",
    "Return one output row for each visible invoice table line or service line.",
    "Use one of the provided account codes for each row's accountPurchase when possible.",
    "Use one of the provided tax codes when you can determine it from the document. If unclear, return null.",
    "When a row shows quantity, a rounded unit price, and a separate row total, copy the exact row total into sum and do not recompute it from price times quantity.",
    "For every row, set needsManualReview=true when any row text, source code, quantity, unit, amount, VAT, account classification, or discount treatment is uncertain, partially unreadable, inferred from context, or does not reconcile. Put a concise reason in manualReviewReason.",
    "Set needsManualReview=false and manualReviewReason=null only when the row is clearly read and reconciles with the document totals.",
    "Return monetary amounts exactly as shown in the document. Do not round or normalize them.",
    `Current extracted rows to repair: ${JSON.stringify(extraction.rows)}`,
    `Invoice totals for cross-checking: ${JSON.stringify({
      amountExcludingVat: extraction.invoice.amountExcludingVat,
      vatAmount: extraction.invoice.vatAmount,
      totalAmount: extraction.invoice.totalAmount,
      roundingAmount: extraction.invoice.roundingAmount,
    })}`,
    `Available purchase accounts: ${JSON.stringify(simplifyAccounts(accounts))}`,
    `Available tax codes: ${JSON.stringify(simplifyTaxCodes(taxCodes))}`,
    `Available dimensions/objects: ${JSON.stringify(simplifyDimensions(dimensions))}`,
  ]
    .filter(Boolean)
    .join("\n");
}
