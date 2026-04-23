import {
  AttachDocumentParams,
  CreatePaymentParams,
  CreatePurchaseInvoiceParams,
  MeritCredentials,
  ProviderExistingInvoiceResult,
  ProviderInvoiceResult,
  ProviderPaymentResult,
  ProviderReferenceData,
  ProviderRuntimeContext,
  SavedConnectionSummary,
  SmartAccountsCredentials,
} from "./accounting-provider-types";
import { InvoiceExtraction } from "./invoice-import-types";

export interface ProviderCatalogArticle {
  code: string;
  description: string;
  unit?: string;
  purchaseAccountCode?: string;
  taxCode?: string;
  type?: string;
  activePurchase?: boolean;
}

export interface ProviderHistoricalInvoiceRow {
  invoiceId: string;
  invoiceNumber?: string;
  issueDate?: string;
  vendorId: string;
  vendorName: string;
  sourceArticleCode?: string;
  description: string;
  articleCode: string;
  articleDescription?: string;
  purchaseAccountCode?: string;
  taxCode?: string;
  unit?: string;
}

export interface ProviderVendorLookupInput {
  extraction: InvoiceExtraction;
}

export interface ProviderVendorLookupResult {
  vendorId: string;
  vendorName: string;
}

export interface ProviderCreateVendorInput {
  extraction: InvoiceExtraction;
  referenceData: ProviderReferenceData;
}

export interface ProviderCreateVendorResult {
  vendorId: string;
  vendorName: string;
}

export interface ProviderConnectionActivity<TCredentials> {
  provider: "smartaccounts" | "merit";
  validateCredentials(
    credentials: TCredentials,
  ): Promise<SavedConnectionSummary>;
  loadContext(credentials: TCredentials): Promise<ProviderRuntimeContext>;
}

export interface ProviderVendorActivity<TCredentials> {
  findVendor(
    credentials: TCredentials,
    input: ProviderVendorLookupInput,
    context: ProviderRuntimeContext,
  ): Promise<ProviderVendorLookupResult | null>;
  createVendor(
    credentials: TCredentials,
    input: ProviderCreateVendorInput,
    context: ProviderRuntimeContext,
  ): Promise<ProviderCreateVendorResult>;
}

export interface ProviderInvoiceLookupActivity<TCredentials> {
  findExistingInvoice(
    credentials: TCredentials,
    params: {
      vendorId: string;
      invoiceNumber: string;
      extraction: InvoiceExtraction;
    },
    context: ProviderRuntimeContext,
  ): Promise<ProviderExistingInvoiceResult | null>;
}

export interface ProviderArticleCatalogActivity<TCredentials> {
  listArticles(
    credentials: TCredentials,
    context: ProviderRuntimeContext,
  ): Promise<ProviderCatalogArticle[]>;
}

export interface ProviderArticleHistoryActivity<TCredentials> {
  getVendorArticleHistory(
    credentials: TCredentials,
    params: {
      vendorId: string;
      extraction: InvoiceExtraction;
    },
    context: ProviderRuntimeContext,
  ): Promise<ProviderHistoricalInvoiceRow[]>;
}

export interface ProviderInvoiceCreationActivity<TCredentials> {
  createPurchaseInvoice(
    credentials: TCredentials,
    params: CreatePurchaseInvoiceParams,
    context: ProviderRuntimeContext,
  ): Promise<ProviderInvoiceResult>;
}

export interface ProviderPaymentActivity<TCredentials> {
  createPayment(
    credentials: TCredentials,
    params: CreatePaymentParams,
    context: ProviderRuntimeContext,
  ): Promise<ProviderPaymentResult>;
}

export interface ProviderAttachmentActivity<TCredentials> {
  attachDocument(
    credentials: TCredentials,
    params: AttachDocumentParams,
    context: ProviderRuntimeContext,
  ): Promise<void>;
}

export interface AccountingProviderActivities<TCredentials>
  extends
    ProviderConnectionActivity<TCredentials>,
    ProviderVendorActivity<TCredentials>,
    ProviderInvoiceLookupActivity<TCredentials>,
    ProviderArticleCatalogActivity<TCredentials>,
    ProviderArticleHistoryActivity<TCredentials>,
    ProviderInvoiceCreationActivity<TCredentials>,
    ProviderPaymentActivity<TCredentials>,
    ProviderAttachmentActivity<TCredentials> {}

export type AnyAccountingProviderActivities =
  | AccountingProviderActivities<SmartAccountsCredentials>
  | AccountingProviderActivities<MeritCredentials>;
