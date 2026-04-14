import {
  InvoiceExtraction,
  SmartAccountsAccount,
  SmartAccountsArticle,
  SmartAccountsBankAccount,
  SmartAccountsCashAccount,
  SmartAccountsVatPc,
  SmartAccountsVendor,
} from "./invoice-import-types";

export type AccountingProvider = "smartaccounts" | "merit";

export interface SmartAccountsCredentials {
  apiKey: string;
  secretKey: string;
}

export interface MeritCredentials {
  apiId: string;
  apiKey: string;
}

export type AccountingCredentials =
  | {
      provider: "smartaccounts";
      credentials: SmartAccountsCredentials;
    }
  | {
      provider: "merit";
      credentials: MeritCredentials;
    };

export interface SavedConnectionSummary {
  provider: AccountingProvider;
  label: string;
  detail: string;
  verifiedAt: string;
  publicId?: string;
  secretMasked?: string;
}

export interface ProviderReferenceAccount {
  code: string;
  type?: string;
  label: string;
}

export interface ProviderReferenceTaxCode {
  code: string;
  rate?: number;
  description?: string;
  purchaseAccountCode?: string;
}

export interface ProviderPaymentAccount {
  type: "BANK" | "CASH";
  id?: string;
  name: string;
  currency?: string;
  accountCode?: string;
}

export interface ProviderReferenceData {
  accounts: ProviderReferenceAccount[];
  taxCodes: ProviderReferenceTaxCode[];
  paymentAccounts: ProviderPaymentAccount[];
}

export interface ProviderResolvedRow {
  code: string;
  description: string;
  quantity?: number;
  unit?: string;
  price?: number;
  sum?: number;
  taxCode?: string;
  accountCode: string;
  accountSelectionReason: string;
}

export interface ProviderVendorMatch {
  id?: string;
  name?: string;
}

export interface ProviderVendorResult {
  vendorId: string;
  vendorName: string;
  createdVendor: boolean;
  existingVendor?: ProviderVendorMatch | null;
}

export interface ProviderExistingInvoiceResult {
  invoiceId: string;
}

export interface ProviderInvoiceResult {
  invoiceId: string;
  attachedFile?: boolean;
}

export interface ProviderPaymentResult {
  paymentId: string;
  paymentAccount: ProviderPaymentAccount;
}

export interface FindOrCreateVendorParams {
  extraction: InvoiceExtraction;
  rows: ProviderResolvedRow[];
  referenceData: ProviderReferenceData;
}

export interface FindExistingInvoiceParams {
  vendorId: string;
  invoiceNumber: string;
  extraction: InvoiceExtraction;
}

export interface CreatePurchaseInvoiceParams {
  vendorId: string;
  extraction: InvoiceExtraction;
  rows: ProviderResolvedRow[];
  referenceData: ProviderReferenceData;
  attachment?: {
    filename: string;
    mimeType: string;
    fileContentBase64: string;
  };
}

export interface CreatePaymentParams {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  extraction: InvoiceExtraction;
  referenceData: ProviderReferenceData;
}

export interface AttachDocumentParams {
  invoiceId: string;
  filename: string;
  mimeType: string;
  fileContentBase64: string;
}

export interface SmartAccountsProviderContext {
  accounts: SmartAccountsAccount[];
  vatPcs: SmartAccountsVatPc[];
  bankAccounts: SmartAccountsBankAccount[];
  cashAccounts: SmartAccountsCashAccount[];
  articles: SmartAccountsArticle[];
}

export interface MeritAccount {
  id?: string;
  code: string;
  name?: string;
  nameEn?: string;
  taxName?: string;
  taxNameEn?: string;
}

export interface MeritTax {
  id: string;
  code: string;
  name?: string;
  rate?: number;
}

export interface MeritBank {
  id: string;
  name: string;
  iban?: string;
  currencyCode?: string;
  accountCode?: string;
}

export interface MeritVendor {
  id?: string;
  name: string;
  regNo?: string;
  vatRegNo?: string;
  bankAccount?: string;
  referenceNo?: string;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  countryCode?: string;
  email?: string;
  phoneNo?: string;
}

export interface MeritPaymentType {
  id: string;
  name: string;
  sourceType?: number;
  currencyCode?: string;
}

export interface MeritProviderContext {
  accounts: MeritAccount[];
  taxes: MeritTax[];
  banks: MeritBank[];
  paymentTypes: MeritPaymentType[];
  vendors: MeritVendor[];
}

export type ProviderRuntimeContext =
  | {
      provider: "smartaccounts";
      referenceData: ProviderReferenceData;
      raw: SmartAccountsProviderContext;
    }
  | {
      provider: "merit";
      referenceData: ProviderReferenceData;
      raw: MeritProviderContext;
    };

export interface AccountingProviderAdapter<TCredentials> {
  provider: AccountingProvider;
  validateCredentials(
    credentials: TCredentials,
  ): Promise<SavedConnectionSummary>;
  loadContext(credentials: TCredentials): Promise<ProviderRuntimeContext>;
  findOrCreateVendor(
    credentials: TCredentials,
    params: FindOrCreateVendorParams,
    context: ProviderRuntimeContext,
  ): Promise<ProviderVendorResult>;
  findExistingInvoice(
    credentials: TCredentials,
    params: FindExistingInvoiceParams,
    context: ProviderRuntimeContext,
  ): Promise<ProviderExistingInvoiceResult | null>;
  createPurchaseInvoice(
    credentials: TCredentials,
    params: CreatePurchaseInvoiceParams,
    context: ProviderRuntimeContext,
  ): Promise<ProviderInvoiceResult>;
  createPayment(
    credentials: TCredentials,
    params: CreatePaymentParams,
    context: ProviderRuntimeContext,
  ): Promise<ProviderPaymentResult>;
  attachDocument(
    credentials: TCredentials,
    params: AttachDocumentParams,
    context: ProviderRuntimeContext,
  ): Promise<void>;
}

export function assertProviderContext<TProvider extends AccountingProvider>(
  context: ProviderRuntimeContext,
  provider: TProvider,
): Extract<ProviderRuntimeContext, { provider: TProvider }> {
  if (context.provider !== provider) {
    throw new Error(
      `Provider context mismatch. Expected ${provider}, received ${context.provider}.`,
    );
  }

  return context as Extract<ProviderRuntimeContext, { provider: TProvider }>;
}

export function isSmartAccountsCredentials(
  credentials: AccountingCredentials,
): credentials is Extract<
  AccountingCredentials,
  { provider: "smartaccounts" }
> {
  return credentials.provider === "smartaccounts";
}

export function isMeritCredentials(
  credentials: AccountingCredentials,
): credentials is Extract<AccountingCredentials, { provider: "merit" }> {
  return credentials.provider === "merit";
}

export function getCredentialFingerprint(credentials: unknown): string {
  return JSON.stringify(credentials);
}

export function getProviderLabel(provider: AccountingProvider): string {
  return provider === "smartaccounts" ? "SmartAccounts" : "Merit";
}

export function toSafeIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function isSmartAccountsVendor(
  value: SmartAccountsVendor | ProviderVendorMatch | null | undefined,
): value is SmartAccountsVendor {
  return Boolean(value && typeof value === "object" && "name" in value);
}
