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
  toErrorMessage,
  validateInvoiceFile,
} from "@/lib/invoice-import/route-support";
import { getStoredAccountingConnection } from "@/lib/user-accounting-connections";
import { getUser } from "@/lib/workos";
import { meritProviderAdapter } from "@/lib/merit";
import { smartAccountsProviderAdapter } from "@/lib/smartaccounts";

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
    return previewInvoiceImport({
      savedConnection,
      activities: smartAccountsProviderAdapter,
      credentials: savedConnection.credentials
        .credentials as SmartAccountsCredentials,
      mimeType,
      filename,
      buffer,
      fingerprint,
    });
  }

  return previewInvoiceImport({
    savedConnection,
    activities: meritProviderAdapter,
    credentials: savedConnection.credentials.credentials as MeritCredentials,
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

  const savedConnection = await getStoredAccountingConnection(user.id);
  if (!savedConnection) {
    return NextResponse.json(
      { error: "Connect Merit or SmartAccounts before importing." },
      { status: 409 },
    );
  }

  try {
    const formData = await request.formData();
    const file = validateInvoiceFile(formData.get("invoice"));
    const result = await previewForSavedConnection(file, savedConnection);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: getInvoiceImportResponseStatus(error) },
    );
  }
}
