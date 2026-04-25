import { NextResponse } from "next/server";
import {
  MeritCredentials,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import { confirmInvoiceImport } from "@/lib/invoice-import/confirm";
import {
  getInvoiceImportResponseStatus,
  parseImportCompanyId,
  parseInvoiceImportDraft,
  toErrorMessage,
} from "@/lib/invoice-import/route-support";
import { meritProviderAdapter } from "@/lib/merit";
import { smartAccountsProviderAdapter } from "@/lib/smartaccounts";
import { getStoredAccountingConnection } from "@/lib/user-accounting-connections";
import { getUser } from "@/lib/workos";
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
    const storedConnection = await getStoredAccountingConnection(company.id);
    if (!storedConnection) {
      await cleanupTemporaryInvoiceBlobReference(formData);
      return NextResponse.json(
        { error: "Connect Merit or SmartAccounts before importing." },
        { status: 409 },
      );
    }
    const savedConnection = {
      ...storedConnection,
      companyContext: buildCompanyAiContext(company),
    };
    const draft = parseInvoiceImportDraft(formData.get("draft"));
    invoiceUpload = await readInvoiceUploadContent(formData);
    try {
      const result =
        savedConnection.provider === "smartaccounts"
          ? await confirmInvoiceImport({
              savedConnection,
              activities: smartAccountsProviderAdapter,
              credentials: scopeSmartAccountsCredentials(
                savedConnection.credentials
                  .credentials as SmartAccountsCredentials,
                savedConnection.companyId ?? "global",
              ),
              mimeType: invoiceUpload.mimeType,
              filename: invoiceUpload.filename,
              buffer: invoiceUpload.buffer,
              draft,
            })
          : await confirmInvoiceImport({
              savedConnection,
              activities: meritProviderAdapter,
              credentials: scopeMeritCredentials(
                savedConnection.credentials.credentials as MeritCredentials,
                savedConnection.companyId ?? "global",
              ),
              mimeType: invoiceUpload.mimeType,
              filename: invoiceUpload.filename,
              buffer: invoiceUpload.buffer,
              draft,
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
