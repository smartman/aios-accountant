import { NextResponse } from "next/server";
import { cleanupExpiredTemporaryInvoiceBlobs } from "@/lib/invoice-import/temporary-blob-cleanup";
import { createLogRequestId, withLogThreadContext } from "@/lib/logger";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`,
  );
}

async function handleCleanupRequest(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupExpiredTemporaryInvoiceBlobs();
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  return withLogThreadContext(
    {
      requestId: createLogRequestId(),
      route: "GET /api/import-invoice/cleanup",
    },
    () => handleCleanupRequest(request),
  );
}
