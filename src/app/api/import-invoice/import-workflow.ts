import {
  AccountingProviderAdapter,
  MeritCredentials,
  ProviderVendorResult,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import { extractInvoiceWithOpenRouter } from "@/lib/openrouter";
import { ImportedInvoiceResult } from "@/lib/invoice-import-types";
import { findVendor as findMeritVendor } from "@/lib/merit-data";
import { findVendor as findSmartAccountsVendor } from "@/lib/smartaccounts-data";
import {
  generateFallbackInvoiceNumber,
  resolvePurchaseRows,
  uniqueAccounts,
} from "@/lib/provider-import-helpers";
import { type StoredAccountingConnection } from "@/lib/user-accounting-connections";

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function assertReferenceAccounts(
  savedConnection: StoredAccountingConnection,
  accountCount: number,
): void {
  if (accountCount) {
    return;
  }

  throw new Error(
    `${savedConnection.summary.label} returned no chart of accounts, so the invoice cannot be classified.`,
  );
}

async function extractInvoiceData<TCredentials>(
  params: {
    savedConnection: StoredAccountingConnection;
    fingerprint: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
  },
  accounts: Awaited<
    ReturnType<AccountingProviderAdapter<TCredentials>["loadContext"]>
  >["referenceData"]["accounts"],
  taxCodes: Awaited<
    ReturnType<AccountingProviderAdapter<TCredentials>["loadContext"]>
  >["referenceData"]["taxCodes"],
) {
  const extraction = await extractInvoiceWithOpenRouter({
    provider: params.savedConnection.provider,
    filename: params.filename,
    mimeType: params.mimeType,
    fileDataUrl: bufferToDataUrl(params.buffer, params.mimeType),
    accounts,
    taxCodes,
  });

  if (!extraction.invoice.invoiceNumber) {
    extraction.invoice.invoiceNumber = generateFallbackInvoiceNumber({
      extraction,
      fingerprint: params.fingerprint,
    });
    extraction.warnings.push(
      `Invoice number was missing in the document, so a fallback number was generated: ${extraction.invoice.invoiceNumber}`,
    );
  }

  return extraction;
}

async function findExistingVendorBeforeCreate(params: {
  savedConnection: StoredAccountingConnection;
  credentials: SmartAccountsCredentials | MeritCredentials;
  extraction: ImportedInvoiceResult["extraction"];
}): Promise<ProviderVendorResult | null> {
  if (params.savedConnection.provider === "smartaccounts") {
    const searchTerm =
      params.extraction.vendor.regCode ??
      params.extraction.vendor.vatNumber ??
      params.extraction.vendor.name;

    if (!searchTerm) {
      return null;
    }

    const vendor = await findSmartAccountsVendor(
      params.credentials as SmartAccountsCredentials,
      searchTerm,
    );

    if (!vendor?.id) {
      return null;
    }

    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      createdVendor: false,
      existingVendor: vendor,
    };
  }

  const vendor = await findMeritVendor(params.credentials as MeritCredentials, {
    regNo: params.extraction.vendor.regCode,
    vatRegNo: params.extraction.vendor.vatNumber,
    name: params.extraction.vendor.name,
  });

  if (!vendor?.id) {
    return null;
  }

  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    createdVendor: false,
    existingVendor: vendor,
  };
}

export async function findExistingImportedInvoice<TCredentials>(params: {
  adapter: AccountingProviderAdapter<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderAdapter<TCredentials>["loadContext"]>
  >;
  extraction: ImportedInvoiceResult["extraction"];
  savedConnection: StoredAccountingConnection;
  vendor: ProviderVendorResult;
  rows: ReturnType<typeof resolvePurchaseRows>;
}): Promise<ImportedInvoiceResult | null> {
  const invoiceNumber = params.extraction.invoice.invoiceNumber;
  if (!invoiceNumber) {
    return null;
  }

  const existingInvoice = await params.adapter.findExistingInvoice(
    params.credentials,
    {
      vendorId: params.vendor.vendorId,
      invoiceNumber,
      extraction: params.extraction,
    },
    params.context,
  );

  if (!existingInvoice) {
    return null;
  }

  return {
    provider: params.savedConnection.provider,
    invoiceId: existingInvoice.invoiceId,
    invoiceNumber,
    vendorId: params.vendor.vendorId,
    vendorName: params.vendor.vendorName,
    createdVendor: params.vendor.createdVendor,
    attachedFile: false,
    createdPayment: false,
    paymentId: null,
    purchaseAccounts: uniqueAccounts(
      params.rows,
      params.context.referenceData.accounts,
    ),
    paymentAccount: null,
    extraction: params.extraction,
    alreadyExisted: true,
  };
}

async function recordPaymentIfNeeded<TCredentials>(params: {
  adapter: AccountingProviderAdapter<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderAdapter<TCredentials>["loadContext"]>
  >;
  createdInvoiceId: string;
  extraction: ImportedInvoiceResult["extraction"];
  vendorId: string;
  vendorName: string;
}): Promise<
  Pick<ImportedInvoiceResult, "createdPayment" | "paymentId" | "paymentAccount">
> {
  if (!params.extraction.payment.isPaid) {
    return {
      createdPayment: false,
      paymentId: null,
      paymentAccount: null,
    };
  }

  try {
    const payment = await params.adapter.createPayment(
      params.credentials,
      {
        invoiceId: params.createdInvoiceId,
        vendorId: params.vendorId,
        vendorName: params.vendorName,
        extraction: params.extraction,
        referenceData: params.context.referenceData,
      },
      params.context,
    );

    return {
      createdPayment: true,
      paymentId: payment.paymentId,
      paymentAccount: {
        type: payment.paymentAccount.type,
        name: payment.paymentAccount.name,
      },
    };
  } catch (paymentError) {
    params.extraction.warnings.push(
      `Invoice was created, but recording the payment failed: ${paymentError instanceof Error ? paymentError.message : "Unknown error"}`,
    );

    return {
      createdPayment: false,
      paymentId: null,
      paymentAccount: null,
    };
  }
}

async function attachFileIfNeeded<TCredentials>(params: {
  adapter: AccountingProviderAdapter<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderAdapter<TCredentials>["loadContext"]>
  >;
  createdInvoiceId: string;
  createdInvoiceAttachedFile: boolean | undefined;
  extraction: ImportedInvoiceResult["extraction"];
  filename: string;
  mimeType: string;
  fileContentBase64: string;
}): Promise<boolean> {
  if (params.createdInvoiceAttachedFile) {
    return true;
  }

  try {
    await params.adapter.attachDocument(
      params.credentials,
      {
        invoiceId: params.createdInvoiceId,
        filename: params.filename,
        mimeType: params.mimeType,
        fileContentBase64: params.fileContentBase64,
      },
      params.context,
    );

    return true;
  } catch (attachmentError) {
    params.extraction.warnings.push(
      `Invoice was created, but attaching the original file failed: ${attachmentError instanceof Error ? attachmentError.message : "Unknown error"}`,
    );
    return false;
  }
}

async function resolveVendorAndExistingInvoice<TCredentials>(params: {
  adapter: AccountingProviderAdapter<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderAdapter<TCredentials>["loadContext"]>
  >;
  extraction: ImportedInvoiceResult["extraction"];
  savedConnection: StoredAccountingConnection;
  rows: ReturnType<typeof resolvePurchaseRows>;
}): Promise<{
  vendor: ProviderVendorResult;
  existingResult: ImportedInvoiceResult | null;
}> {
  const existingVendor = await findExistingVendorBeforeCreate({
    savedConnection: params.savedConnection,
    credentials: params.credentials as
      | SmartAccountsCredentials
      | MeritCredentials,
    extraction: params.extraction,
  });

  if (existingVendor) {
    const existingResult = await findExistingImportedInvoice({
      adapter: params.adapter,
      credentials: params.credentials,
      context: params.context,
      extraction: params.extraction,
      savedConnection: params.savedConnection,
      vendor: existingVendor,
      rows: params.rows,
    });

    return { vendor: existingVendor, existingResult };
  }

  const vendor = await params.adapter.findOrCreateVendor(
    params.credentials,
    {
      extraction: params.extraction,
      rows: params.rows,
      referenceData: params.context.referenceData,
    },
    params.context,
  );

  const existingResult = await findExistingImportedInvoice({
    adapter: params.adapter,
    credentials: params.credentials,
    context: params.context,
    extraction: params.extraction,
    savedConnection: params.savedConnection,
    vendor,
    rows: params.rows,
  });

  return { vendor, existingResult };
}

export async function importWithAdapter<TCredentials>(params: {
  savedConnection: StoredAccountingConnection;
  adapter: AccountingProviderAdapter<TCredentials>;
  credentials: TCredentials;
  mimeType: string;
  filename: string;
  buffer: Buffer;
  fingerprint: string;
}): Promise<ImportedInvoiceResult> {
  const context = await params.adapter.loadContext(params.credentials);
  assertReferenceAccounts(
    params.savedConnection,
    context.referenceData.accounts.length,
  );
  const extraction = await extractInvoiceData<TCredentials>(
    params,
    context.referenceData.accounts,
    context.referenceData.taxCodes,
  );
  const rows = resolvePurchaseRows({
    extraction,
    referenceData: context.referenceData,
  });
  const { vendor, existingResult } = await resolveVendorAndExistingInvoice({
    adapter: params.adapter,
    credentials: params.credentials,
    context,
    extraction,
    savedConnection: params.savedConnection,
    rows,
  });

  if (existingResult) {
    return existingResult;
  }

  const fileContentBase64 = params.buffer.toString("base64");
  const createdInvoice = await params.adapter.createPurchaseInvoice(
    params.credentials,
    {
      vendorId: vendor.vendorId,
      extraction,
      rows,
      referenceData: context.referenceData,
      attachment: {
        filename: params.filename,
        mimeType: params.mimeType,
        fileContentBase64,
      },
    },
    context,
  );
  const paymentResult = await recordPaymentIfNeeded({
    adapter: params.adapter,
    credentials: params.credentials,
    context,
    createdInvoiceId: createdInvoice.invoiceId,
    extraction,
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
  });
  const attachedFile = await attachFileIfNeeded({
    adapter: params.adapter,
    credentials: params.credentials,
    context,
    createdInvoiceId: createdInvoice.invoiceId,
    createdInvoiceAttachedFile: createdInvoice.attachedFile,
    extraction,
    filename: params.filename,
    mimeType: params.mimeType,
    fileContentBase64,
  });

  return {
    provider: params.savedConnection.provider,
    invoiceId: createdInvoice.invoiceId,
    invoiceNumber: extraction.invoice.invoiceNumber,
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    createdVendor: vendor.createdVendor,
    attachedFile,
    createdPayment: paymentResult.createdPayment,
    paymentId: paymentResult.paymentId,
    purchaseAccounts: uniqueAccounts(rows, context.referenceData.accounts),
    paymentAccount: paymentResult.paymentAccount,
    extraction,
    alreadyExisted: false,
  };
}
