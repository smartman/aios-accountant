import { expect, it, vi } from "vitest";
import { extractInvoiceWithOpenRouter } from "../openrouter";
import {
  assertReferenceAccounts,
  attachFileIfNeeded,
  buildExistingResult,
  extractInvoiceData,
  recordPaymentIfNeeded,
} from "./workflow-utils";

vi.mock("../openrouter", () => ({
  extractInvoiceWithOpenRouter: vi.fn(),
}));

function buildSavedConnection() {
  return {
    workosUserId: "user-1",
    provider: "smartaccounts" as const,
    credentials: {
      provider: "smartaccounts" as const,
      credentials: { apiKey: "public", secretKey: "secret" },
    },
    summary: {
      provider: "smartaccounts" as const,
      label: "SmartAccounts",
      detail: "Verified",
      verifiedAt: new Date().toISOString(),
    },
    verifiedAt: new Date(),
  };
}

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
      invoiceNumber: null,
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
      paymentAccountName: "Main bank",
    },
    rows: [],
    warnings: [] as string[],
  };
}

it("validates reference accounts and generates fallback invoice numbers", async () => {
  expect(() => assertReferenceAccounts(buildSavedConnection(), 0)).toThrow(
    "returned no chart of accounts",
  );
  expect(() =>
    assertReferenceAccounts(buildSavedConnection(), 1),
  ).not.toThrow();

  vi.mocked(extractInvoiceWithOpenRouter).mockResolvedValue(buildExtraction());
  const extraction = await extractInvoiceData(
    {
      savedConnection: buildSavedConnection(),
      workflow: "preview",
      fingerprint: "abcdef123456",
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("invoice"),
    },
    [],
    [],
  );

  expect(extraction.invoice.invoiceNumber).toBe("AUTO-20260420-ABCDEF12");
  expect(extraction.warnings[0]).toContain("fallback number");
});

it("records payments and attachments with success and failure fallbacks", async () => {
  const extraction = buildExtraction();
  const activities = {
    createPayment: vi.fn().mockResolvedValue({
      paymentId: "payment-1",
      paymentAccount: { type: "BANK" as const, name: "Main bank" },
    }),
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
  ).resolves.toMatchObject({ createdPayment: true, paymentId: "payment-1" });
  expect(activities.createPayment).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      paymentAccountName: "Main bank",
    }),
    expect.anything(),
  );

  extraction.payment.isPaid = false;
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

  extraction.payment.isPaid = true;
  activities.createPayment.mockRejectedValueOnce(new Error("payment boom"));
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
  ).resolves.toMatchObject({ createdPayment: false });
  expect(extraction.warnings.at(-1)).toContain("payment boom");

  await expect(
    attachFileIfNeeded({
      activities: activities as never,
      credentials: {} as never,
      context: context as never,
      createdInvoiceId: "invoice-1",
      createdInvoiceAttachedFile: true,
      extraction,
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      fileContentBase64: "ZmFrZQ==",
    }),
  ).resolves.toBe(true);

  activities.attachDocument.mockRejectedValueOnce(new Error("attach boom"));
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
  ).resolves.toBe(false);
  expect(extraction.warnings.at(-1)).toContain("attach boom");
});

it("builds already-existing import results", () => {
  expect(
    buildExistingResult({
      provider: "smartaccounts",
      invoiceId: "invoice-1",
      invoiceNumber: "INV-1",
      vendor: { vendorId: "vendor-1", vendorName: "Vendor OÜ" },
      extraction: buildExtraction(),
      purchaseAccounts: [
        { code: "4000", label: "Services", reason: "Matched services" },
      ],
    }),
  ).toMatchObject({
    alreadyExisted: true,
    createdPayment: false,
    invoiceId: "invoice-1",
  });
});
