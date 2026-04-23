import { extractInvoiceWithOpenRouter } from "../openrouter";
import { ImportedInvoiceResult } from "../invoice-import-types";
import { generateFallbackInvoiceNumber } from "../provider-import-helpers";
import {
  AccountingProviderActivities,
  ProviderCreateVendorResult,
} from "../accounting-provider-activities";
import { StoredAccountingConnection } from "../user-accounting-connections";
import {
  logInvoiceImportEvent,
  measureInvoiceImportPhase,
} from "./observability";
import { normalizeInvoiceExtraction } from "./normalization";

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function assertReferenceAccounts(
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

export async function extractInvoiceData<TCredentials>(
  params: {
    savedConnection: StoredAccountingConnection;
    workflow: "preview" | "confirm";
    fingerprint: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
  },
  accounts: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >["referenceData"]["accounts"],
  taxCodes: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
  >["referenceData"]["taxCodes"],
) {
  const rawExtraction = await measureInvoiceImportPhase({
    workflow: params.workflow,
    provider: params.savedConnection.provider,
    phase: "extractInvoice",
    metadata: {
      accountCount: accounts.length,
      taxCodeCount: taxCodes.length,
    },
    run: () =>
      extractInvoiceWithOpenRouter({
        provider: params.savedConnection.provider,
        filename: params.filename,
        mimeType: params.mimeType,
        fileDataUrl: bufferToDataUrl(params.buffer, params.mimeType),
        accounts,
        taxCodes,
      }),
  });
  const extraction = normalizeInvoiceExtraction(rawExtraction);

  const usedFallbackInvoiceNumber = !extraction.invoice.invoiceNumber;
  if (usedFallbackInvoiceNumber) {
    extraction.invoice.invoiceNumber = generateFallbackInvoiceNumber({
      extraction,
      fingerprint: params.fingerprint,
    });
    extraction.warnings.push(
      `Invoice number was missing in the document, so a fallback number was generated: ${extraction.invoice.invoiceNumber}`,
    );
  }

  logInvoiceImportEvent({
    workflow: params.workflow,
    provider: params.savedConnection.provider,
    phase: "extractInvoice.summary",
    status: "success",
    metadata: {
      usedFallbackInvoiceNumber,
      rowCount: extraction.rows.length,
      warningCount: extraction.warnings.length,
    },
  });

  return extraction;
}

export async function recordPaymentIfNeeded<TCredentials>(params: {
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
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
    const payment = await params.activities.createPayment(
      params.credentials,
      {
        invoiceId: params.createdInvoiceId,
        vendorId: params.vendorId,
        vendorName: params.vendorName,
        extraction: params.extraction,
        referenceData: params.context.referenceData,
        paymentAccountName:
          params.extraction.payment.paymentAccountName ?? null,
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

export async function attachFileIfNeeded<TCredentials>(params: {
  activities: AccountingProviderActivities<TCredentials>;
  credentials: TCredentials;
  context: Awaited<
    ReturnType<AccountingProviderActivities<TCredentials>["loadContext"]>
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
    await params.activities.attachDocument(
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

export function buildExistingResult(params: {
  provider: "smartaccounts" | "merit";
  invoiceId: string;
  invoiceNumber: string | null;
  vendor: ProviderCreateVendorResult;
  extraction: ImportedInvoiceResult["extraction"];
  purchaseAccounts: ImportedInvoiceResult["purchaseAccounts"];
}): ImportedInvoiceResult {
  return {
    provider: params.provider,
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    vendorId: params.vendor.vendorId,
    vendorName: params.vendor.vendorName,
    createdVendor: false,
    attachedFile: false,
    createdPayment: false,
    paymentId: null,
    purchaseAccounts: params.purchaseAccounts,
    paymentAccount: null,
    extraction: params.extraction,
    alreadyExisted: true,
  };
}
