import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import {
  DIRECT_INVOICE_UPLOAD_MAX_BYTES,
  MAX_BLOB_INVOICE_UPLOAD_BYTES,
} from "@/lib/invoice-import/upload-limits";
import { requireCompanyForUser } from "@/lib/companies/repository";
import { getUser } from "@/lib/workos";

export const runtime = "nodejs";

interface InvoiceUploadClientPayload {
  companyId: string;
  contentType: string;
  filename: string;
  size: number;
}

function parseClientPayload(value: string | null): InvoiceUploadClientPayload {
  if (!value) {
    throw new Error("Missing upload payload.");
  }

  const payload = JSON.parse(value) as {
    companyId?: unknown;
    contentType?: unknown;
    filename?: unknown;
    size?: unknown;
  };

  if (
    typeof payload.companyId !== "string" ||
    typeof payload.filename !== "string" ||
    typeof payload.contentType !== "string" ||
    typeof payload.size !== "number"
  ) {
    throw new Error("Upload payload is invalid.");
  }

  return {
    companyId: payload.companyId,
    contentType: payload.contentType,
    filename: payload.filename,
    size: payload.size,
  };
}

function validateTemporaryInvoiceUpload(pathname: string, size: number) {
  if (!pathname.startsWith("invoice-import/")) {
    throw new Error("Upload path is invalid.");
  }

  if (
    size <= DIRECT_INVOICE_UPLOAD_MAX_BYTES ||
    size > MAX_BLOB_INVOICE_UPLOAD_BYTES
  ) {
    throw new Error("Upload size is invalid.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const { user } = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        validateTemporaryInvoiceUpload(pathname, payload.size);
        await requireCompanyForUser({
          companyId: payload.companyId,
          user: {
            id: user.id,
            email: user.email,
          },
        });

        return {
          allowedContentTypes: ["application/pdf", "image/*"],
          maximumSizeInBytes: MAX_BLOB_INVOICE_UPLOAD_BYTES,
          addRandomSuffix: true,
          cacheControlMaxAge: 60,
          validUntil: Date.now() + 5 * 60 * 1000,
          tokenPayload: JSON.stringify({
            companyId: payload.companyId,
          }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
