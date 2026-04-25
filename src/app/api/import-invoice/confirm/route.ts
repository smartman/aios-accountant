import { NextResponse } from "next/server";
import {
  MeritCredentials,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import { confirmInvoiceImport } from "@/lib/invoice-import/confirm";
import {
  getSafeInvoiceFilename,
  getInvoiceImportResponseStatus,
  getMimeType,
  parseImportCompanyId,
  parseInvoiceImportDraft,
  toErrorMessage,
  validateInvoiceFile,
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

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user } = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
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
      return NextResponse.json(
        { error: "Connect Merit or SmartAccounts before importing." },
        { status: 409 },
      );
    }
    const savedConnection = {
      ...storedConnection,
      companyContext: buildCompanyAiContext(company),
    };
    const file = validateInvoiceFile(formData.get("invoice"));
    const draft = parseInvoiceImportDraft(formData.get("draft"));
    const mimeType = getMimeType(file);
    const filename = getSafeInvoiceFilename(file);
    const buffer = Buffer.from(await file.arrayBuffer());

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
            mimeType,
            filename,
            buffer,
            draft,
          })
        : await confirmInvoiceImport({
            savedConnection,
            activities: meritProviderAdapter,
            credentials: scopeMeritCredentials(
              savedConnection.credentials.credentials as MeritCredentials,
              savedConnection.companyId ?? "global",
            ),
            mimeType,
            filename,
            buffer,
            draft,
          });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: getInvoiceImportResponseStatus(error) },
    );
  }
}
