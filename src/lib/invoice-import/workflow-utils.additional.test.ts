import { describe, expect, it, vi } from "vitest";
import { attachFileIfNeeded, recordPaymentIfNeeded } from "./workflow-utils";

function buildExtraction() {
  return {
    vendor: {
      name: "Vendor OÜ",
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: null,
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 100,
      vatAmount: 22,
      totalAmount: 122,
      notes: null,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-04-20",
      paymentAmount: 122,
      paymentChannelHint: "BANK" as const,
      reason: null,
      paymentAccountName: null,
    },
    rows: [],
    warnings: [] as string[],
  };
}

describe("workflow utils additional branches", () => {
  it("returns success for attachment upload and uses unknown-error fallbacks", async () => {
    const extraction = buildExtraction();
    const activities = {
      createPayment: vi.fn().mockRejectedValueOnce("boom"),
      attachDocument: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      referenceData: { accounts: [], taxCodes: [], paymentAccounts: [] },
    };

    await expect(
      recordPaymentIfNeeded({
        activities: activities as never,
        credentials: {} as never,
        context: context as never,
        createdInvoiceId: "invoice-1",
        extraction,
        vendorId: "vendor-1",
        vendorName: "Vendor OÜ",
      }),
    ).resolves.toMatchObject({ createdPayment: false, paymentId: null });
    expect(extraction.warnings.at(-1)).toContain("Unknown error");

    await expect(
      attachFileIfNeeded({
        activities: activities as never,
        credentials: {} as never,
        context: context as never,
        createdInvoiceId: "invoice-1",
        createdInvoiceAttachedFile: false,
        extraction,
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        fileContentBase64: "ZmFrZQ==",
      }),
    ).resolves.toBe(true);
  });
});
