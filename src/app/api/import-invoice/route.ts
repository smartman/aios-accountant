import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  MeritCredentials,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import { previewInvoiceImport } from "@/lib/invoice-import/preview";
import {
  getSafeInvoiceFilename,
  getInvoiceImportResponseStatus,
  getMimeType,
  parseImportCompanyId,
  toErrorMessage,
  validateInvoiceFile,
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

export const runtime = "nodejs";

async function previewForSavedConnection(
  file: File,
  savedConnection: NonNullable<
    Awaited<ReturnType<typeof getStoredAccountingConnection>>
  >,
) {
  const mimeType = getMimeType(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const fingerprint = crypto.createHash("sha1").update(buffer).digest("hex");
  const filename = getSafeInvoiceFilename(file);

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
    const savedConnection = await getStoredAccountingConnection(company.id);
    if (!savedConnection) {
      return NextResponse.json(
        { error: "Connect Merit or SmartAccounts before importing." },
        { status: 409 },
      );
    }

    const file = validateInvoiceFile(formData.get("invoice"));
    const result = await previewForSavedConnection(file, {
      ...savedConnection,
      companyContext: buildCompanyAiContext(company),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: getInvoiceImportResponseStatus(error) },
    );
  }
}
