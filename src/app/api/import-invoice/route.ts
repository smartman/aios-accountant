import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  MeritCredentials,
  SmartAccountsCredentials,
} from "@/lib/accounting-provider-types";
import {
  getStoredAccountingConnection,
  type StoredAccountingConnection,
} from "@/lib/user-accounting-connections";
import { getUser } from "@/lib/workos";
import { meritProviderAdapter } from "@/lib/merit";
import { smartAccountsProviderAdapter } from "@/lib/smartaccounts";
import { importWithAdapter } from "./import-workflow";

export const runtime = "nodejs";
export { importWithAdapter } from "./import-workflow";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getMimeType(file: File): string {
  return file.type || "application/octet-stream";
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_");
}

function validateInvoiceFile(file: FormDataEntryValue | null): File {
  if (!(file instanceof File)) {
    throw new Error("Missing invoice file.");
  }

  const mimeType = getMimeType(file);
  if (mimeType !== "application/pdf" && !mimeType.startsWith("image/")) {
    throw new Error("Only PDF and image invoices are supported right now.");
  }

  return file;
}

async function importForSavedConnection(
  savedConnection: StoredAccountingConnection,
  file: File,
) {
  const mimeType = getMimeType(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const fingerprint = crypto.createHash("sha1").update(buffer).digest("hex");
  const filename = sanitizeFilename(file.name || "invoice");

  if (savedConnection.provider === "smartaccounts") {
    return importWithAdapter({
      savedConnection,
      adapter: smartAccountsProviderAdapter,
      credentials: savedConnection.credentials
        .credentials as SmartAccountsCredentials,
      mimeType,
      filename,
      buffer,
      fingerprint,
    });
  }

  return importWithAdapter({
    savedConnection,
    adapter: meritProviderAdapter,
    credentials: savedConnection.credentials.credentials as MeritCredentials,
    mimeType,
    filename,
    buffer,
    fingerprint,
  });
}

function getImportResponseStatus(error: unknown): number {
  const message = toErrorMessage(error);
  return message === "Missing invoice file." ||
    message === "Only PDF and image invoices are supported right now."
    ? 400
    : 500;
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
    const result = await importForSavedConnection(savedConnection, file);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: toErrorMessage(error) },
      { status: getImportResponseStatus(error) },
    );
  }
}
