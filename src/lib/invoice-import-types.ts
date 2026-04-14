export interface SmartAccountsAccount {
  code: string;
  type?: string;
  name?: string;
  nameEt?: string;
  nameEn?: string;
  description?: string;
  descriptionEt?: string;
  descriptionEn?: string;
}

export interface SmartAccountsBankAccount {
  name: string;
  account?: string;
  currency?: string;
  iban?: string;
  swift?: string;
  forNetting?: boolean;
  defaultEInvoiceAccount?: boolean;
  order?: string;
}

export interface SmartAccountsCashAccount {
  name: string;
  account?: string;
  currency?: string;
  order?: string;
}

export interface SmartAccountsVatPc {
  vatPc: string;
  percent?: number;
  description?: string;
  descriptionEt?: string;
  descriptionEn?: string;
  accountPurchase?: string;
  accountSales?: string;
}

export interface SmartAccountsVendor {
  id?: string;
  name: string;
  regCode?: string;
  vatNumber?: string;
  bankAccount?: string;
  referenceNumber?: string;
  accountUnpaid?: string;
  address?: {
    country?: string;
    county?: string;
    city?: string;
    address1?: string;
    address2?: string;
    postalCode?: string;
  };
}

export interface SmartAccountsArticle {
  code: string;
  description?: string;
  unit?: string;
  type?: string;
  activePurchase?: boolean;
  activeSales?: boolean;
  accountPurchase?: string;
  vatPc?: string;
}

export interface InvoiceExtractionRow {
  description: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  sum: number | null;
  vatRate: number | null;
  vatPc: string | null;
  accountPurchase: string | null;
  accountSelectionReason: string;
}

export interface InvoiceExtraction {
  vendor: {
    name: string | null;
    regCode: string | null;
    vatNumber: string | null;
    bankAccount: string | null;
    email: string | null;
    phone: string | null;
    countryCode: string | null;
    city: string | null;
    postalCode: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
  };
  invoice: {
    documentType: string | null;
    invoiceNumber: string | null;
    referenceNumber: string | null;
    currency: string | null;
    issueDate: string | null;
    dueDate: string | null;
    entryDate: string | null;
    amountExcludingVat: number | null;
    vatAmount: number | null;
    totalAmount: number | null;
    notes: string | null;
  };
  payment: {
    isPaid: boolean;
    paymentDate: string | null;
    paymentAmount: number | null;
    paymentChannelHint: "BANK" | "CASH" | null;
    reason: string | null;
  };
  rows: InvoiceExtractionRow[];
  warnings: string[];
}

export interface ImportedInvoiceResult {
  provider: "smartaccounts" | "merit";
  invoiceId: string;
  invoiceNumber: string | null;
  vendorId: string;
  vendorName: string;
  createdVendor: boolean;
  attachedFile: boolean;
  createdPayment: boolean;
  paymentId: string | null;
  purchaseAccounts: Array<{
    code: string;
    label: string;
    reason: string;
  }>;
  paymentAccount: {
    type: "BANK" | "CASH";
    name: string;
  } | null;
  extraction: InvoiceExtraction;
  alreadyExisted: boolean;
}

export type InvoiceBatchItemStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type InvoiceBatchEvent =
  | {
      type: "batch-start";
      total: number;
      provider: "smartaccounts" | "merit";
    }
  | {
      type: "file-start";
      index: number;
      filename: string;
      total: number;
    }
  | {
      type: "file-complete";
      index: number;
      filename: string;
      total: number;
      completed: number;
      failed: number;
      result: ImportedInvoiceResult;
    }
  | {
      type: "file-error";
      index: number;
      filename: string;
      total: number;
      completed: number;
      failed: number;
      error: string;
    }
  | {
      type: "batch-complete";
      total: number;
      completed: number;
      failed: number;
      successful: number;
    };
