import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  MeritCredentials,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import { previewInvoiceImport } from "@/lib/invoice-import/preview";
import {
  getInvoiceImportResponseStatus,
  parseImportCompanyId,
  toErrorMessage,
} from "@/lib/invoice-import/route-support";
import { getStoredAccountingConnection } from "@/lib/user-accounting-connections";
import { getUser } from "@/lib/workos";
import { meritProviderAdapter } from "@/lib/merit";
import { smartAccountsProviderAdapter } from "@/lib/smartaccounts";
import {
  scopeMeritCredentials,
  scopeSmartAccountsCredentials,
} from "@/lib/accounting-provider-cache";
import { buildCompanyAiContext } from "@/lib/companies/ai-context";
import { requireCompanyForUser } from "@/lib/companies/repository";
import {
  cleanupTemporaryInvoiceBlobReference,
  readInvoiceUploadContent,
} from "@/lib/invoice-import/temporary-blob";

export const runtime = "nodejs";

async function previewForSavedConnection(params: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  savedConnection: NonNullable<
    Awaited<ReturnType<typeof getStoredAccountingConnection>>
  >;
}) {
  const { buffer, filename, mimeType, savedConnection } = params;
  const fingerprint = crypto.createHash("sha1").update(buffer).digest("hex");

  if (savedConnection.provider === "smartaccounts") {
    const credentials = scopeSmartAccountsCredentials(
      savedConnection.credentials.credentials as SmartAccountsCredentials,
      savedConnection.companyId ?? "global",
    );
    return previewInvoiceImport({
      savedConnection,
      activities: smartAccountsProviderAdapter,
      credentials,
      mimeType,
      filename,
      buffer,
      fingerprint,
    });
  }

  const credentials = scopeMeritCredentials(
    savedConnection.credentials.credentials as MeritCredentials,
    savedConnection.companyId ?? "global",
  );
  return previewInvoiceImport({
    savedConnection,
    activities: meritProviderAdapter,
    credentials,
    mimeType,
    filename,
    buffer,
    fingerprint,
  });
}

export async function POST(request: Request) {
  const { user } = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData | null = null;
  let invoiceUpload: Awaited<
    ReturnType<typeof readInvoiceUploadContent>
  > | null = null;

  try {
    formData = await request.formData();
    const companyId = parseImportCompanyId(formData.get("companyId"));
    const company = await requireCompanyForUser({
      companyId,
      user: {
        id: user.id,
        email: user.email,
      },
    });
    const savedConnection = await getStoredAccountingConnection(company.id);
    if (!savedConnection) {
      await cleanupTemporaryInvoiceBlobReference(formData);
      return NextResponse.json(
        { error: "Connect Merit or SmartAccounts before importing." },
        { status: 409 },
      );
    }
    invoiceUpload = await readInvoiceUploadContent(formData);
    try {
      const result = await previewForSavedConnection({
        filename: invoiceUpload.filename,
        mimeType: invoiceUpload.mimeType,
        buffer: invoiceUpload.buffer,
        savedConnection: {
          ...savedConnection,
          companyContext: buildCompanyAiContext(company),
        },
      });

      return NextResponse.json(result);
    } finally {
      await invoiceUpload.cleanup();
    }
  } catch (error) {
    if (formData && !invoiceUpload) {
      try {
        await cleanupTemporaryInvoiceBlobReference(formData);
      } catch {}
    }

    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: getInvoiceImportResponseStatus(error) },
    );
  }
}
