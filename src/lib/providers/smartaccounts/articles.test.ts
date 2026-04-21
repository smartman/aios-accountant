import { afterEach, expect, it, vi } from "vitest";
import { clearSmartAccountsCachesForTests } from "./core";
import { getVendorInvoiceHistory, listCatalogArticles } from "./articles";

vi.mock("./loaders", () => ({
  getArticles: vi.fn(async () => [
    {
      code: "FURNITURE",
      description: "Furniture",
      unit: "pcs",
      type: "SERVICE",
      activePurchase: true,
      accountPurchase: "4000",
      vatPc: "VAT22",
    },
    {
      code: "GENERIC",
      description: null,
      unit: null,
      type: "SERVICE",
      activePurchase: true,
      accountPurchase: null,
      vatPc: null,
    },
  ]),
}));

function buildCredentials() {
  return {
    apiKey: "smart-api",
    secretKey: "smart-secret",
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearSmartAccountsCachesForTests();
});

it("normalizes catalog articles and vendor invoice history", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse({
      vendorInvoices: [
        {
          invoiceId: "invoice-1",
          vendorId: "vendor-1",
          vendorName: "Vendor OÜ",
          invoiceNumber: "INV-1",
          date: "20.04.2026",
          rows: [
            {
              code: "FURNITURE",
              description: "Office chair",
              accountPurchase: "4000",
              vatPc: "VAT22",
              unit: "pcs",
            },
            {},
          ],
        },
        { vendorId: "missing" },
      ],
    }),
  );

  await expect(listCatalogArticles(buildCredentials())).resolves.toEqual([
    expect.objectContaining({
      code: "FURNITURE",
      description: "Furniture",
    }),
    expect.objectContaining({
      code: "GENERIC",
      description: "GENERIC",
    }),
  ]);
  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-1",
      extraction: {
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
          invoiceNumber: "INV-NEW",
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
          isPaid: false,
          paymentDate: null,
          paymentAmount: null,
          paymentChannelHint: null,
          reason: null,
        },
        rows: [],
        warnings: [],
      },
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      invoiceId: "invoice-1",
      articleCode: "FURNITURE",
      description: "Office chair",
    }),
  ]);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("uses fallback invoice dates and ignores invalid history rows", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse({
      invoices: [
        {
          id: "invoice-2",
          vendorId: "vendor-2",
          name: "Alt Vendor",
          entryDate: "19.04.2026",
          rows: [null],
        },
      ],
    }),
  );

  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-2",
      extraction: {
        vendor: {
          name: "Alt Vendor",
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
          invoiceNumber: "INV-NEW",
          referenceNumber: null,
          currency: "EUR",
          issueDate: "not-a-date",
          dueDate: null,
          entryDate: null,
          amountExcludingVat: 100,
          vatAmount: 22,
          totalAmount: 122,
          notes: null,
        },
        payment: {
          isPaid: false,
          paymentDate: null,
          paymentAmount: null,
          paymentChannelHint: null,
          reason: null,
        },
        rows: [],
        warnings: [],
      },
    }),
  ).resolves.toEqual([]);

  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("dateFrom=01.01.2000");
});

it("uses invoice entry dates when vendor history omits the main date field", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse({
      invoices: [
        {
          id: "invoice-3",
          vendorId: "vendor-3",
          name: "Entry Vendor",
          entryDate: "18.04.2026",
          rows: [
            {
              code: "GENERIC",
              description: "General expense",
            },
          ],
        },
      ],
    }),
  );

  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-3",
      extraction: {
        vendor: {
          name: "Entry Vendor",
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
          invoiceNumber: "INV-NEW",
          referenceNumber: null,
          currency: "EUR",
          issueDate: null,
          dueDate: null,
          entryDate: "2026-04-20",
          amountExcludingVat: 100,
          vatAmount: 22,
          totalAmount: 122,
          notes: null,
        },
        payment: {
          isPaid: false,
          paymentDate: null,
          paymentAmount: null,
          paymentChannelHint: null,
          reason: null,
        },
        rows: [],
        warnings: [],
      },
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      invoiceId: "invoice-3",
      articleCode: "GENERIC",
      issueDate: "18.04.2026",
    }),
  ]);
});
