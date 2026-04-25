import { NextResponse } from "next/server";
import { cleanupExpiredTemporaryInvoiceBlobs } from "@/lib/invoice-import/temporary-blob-cleanup";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`,
  );
}

export async function GET(request: Request): Promise<NextResponse> {
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
