import { afterEach, expect, it, vi } from "vitest";
import { createItem, getVendorInvoiceHistory, listItems } from "./data";
import * as meritCore from "./core";
import { clearMeritCachesForTests } from "./core";

function buildCredentials() {
  return {
    apiId: "merit-id",
    apiKey: "merit-key",
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function buildExtraction(
  issueDate: string | null = "2026-04-20",
  entryDate: string | null = "2026-04-20",
) {
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
      documentType: "invoice" as const,
      invoiceNumber: "INV-NEW",
      referenceNumber: null,
      currency: "EUR",
      issueDate,
      dueDate: null,
      entryDate,
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
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  clearMeritCachesForTests();
});

it("lists items and creates items", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      jsonResponse([
        {
          ItemId: "item-1",
          Code: "FURNITURE",
          Description: "Furniture",
          UnitofMeasureName: "pcs",
          Usage: 2,
          PurchaseAccountCode: "4000",
          TaxId: "tax-22",
          Type: 2,
        },
        {
          ItemId: "item-2",
          Code: "BROKEN",
        },
      ]),
    )
    .mockResolvedValueOnce(jsonResponse([{ Code: "FURNITURE" }]));

  await expect(listItems(buildCredentials())).resolves.toEqual([
    expect.objectContaining({
      code: "FURNITURE",
      description: "Furniture",
    }),
  ]);
  await expect(
    createItem(buildCredentials(), {
      code: "FURNITURE",
      description: "Furniture",
      purchaseAccountCode: "4000",
      taxCode: "tax-22",
      type: "2",
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      code: "FURNITURE",
      description: "Furniture",
    }),
  );
});

it("normalizes merit invoice history rows", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      jsonResponse([
        {
          PIHId: "invoice-1",
          VendorId: "vendor-1",
          VendorName: "Vendor OÜ",
          BillNo: "INV-1",
          DocDate: "20260420",
        },
        { PIHId: "missing", VendorId: "vendor-1" },
      ]),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        Header: {
          PIHId: "invoice-1",
          VendorId: "vendor-1",
          VendorName: "Vendor OÜ",
          BillNo: "INV-1",
          DocumentDate: "20260420",
        },
        Lines: [
          null,
          {
            ArticleCode: "FURNITURE",
            Description: "Office chair",
            TaxId: "tax-22",
            AccountCode: "4000",
            UOMName: "pcs",
          },
          {},
        ],
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        Header: {
          PIHId: "missing",
          VendorId: "vendor-1",
          VendorName: "Vendor OÜ",
        },
        Lines: [],
      }),
    );

  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-1",
      extraction: buildExtraction(),
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      invoiceId: "invoice-1",
      articleCode: "FURNITURE",
      articleDescription: "Office chair",
      description: "Office chair",
    }),
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(3);
  const historyRequest = fetchMock.mock.calls[0]?.[1];
  expect(historyRequest).toMatchObject({
    method: "POST",
  });
  const historyBody = JSON.parse(String(historyRequest?.body));
  expect(historyBody).toMatchObject({
    PeriodStart: "20260121",
    PeriodEnd: "20260420",
    DateType: 0,
  });
  const detailBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
  expect(detailBody).toMatchObject({
    Id: "invoice-1",
    SkipAttachment: true,
  });
});

it("returns an empty history list when invoice metadata is incomplete", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse([
      {
        PIHId: "invoice-2",
        VendorId: "vendor-1",
        InvoiceRow: [
          {
            Description: "Desk",
            Item: {
              Code: "FURNITURE",
              Description: "Furniture",
            },
          },
        ],
      },
    ]),
  );

  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-1",
      extraction: buildExtraction("bad-date", null),
    }),
  ).resolves.toEqual([]);
});

it("uses entry date, invoice Id fallback, and invoice rows when detail lines are absent", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      jsonResponse([
        {
          Id: "invoice-4",
          VendorId: "vendor-1",
          VendorName: "Vendor OÜ",
          BillNo: "INV-4",
          InvoiceRow: [
            {
              Description: "USB-C dock",
              Item: {
                Code: "it",
                Description: "IT teenused, arvutitarvikud",
                UOMName: "pcs",
              },
              PurchaseAccCode: "it",
              TaxName: "VAT22",
            },
          ],
        },
      ]),
    )
    .mockResolvedValueOnce(jsonResponse({ Header: { VendorId: "vendor-1" } }));

  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-1",
      extraction: buildExtraction(null, "2026-04-20"),
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      invoiceId: "invoice-4",
      invoiceNumber: "INV-4",
      vendorId: "vendor-1",
      vendorName: "Vendor OÜ",
      articleCode: "it",
      description: "USB-C dock",
      articleDescription: "USB-C dock",
      purchaseAccountCode: "it",
      taxCode: "VAT22",
      unit: "pcs",
    }),
  ]);

  const historyBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(historyBody).toMatchObject({
    PeriodStart: "20260121",
    PeriodEnd: "20260420",
    DateType: 0,
  });
  const detailBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
  expect(detailBody).toMatchObject({
    Id: "invoice-4",
    SkipAttachment: true,
  });
});

it("filters catalog items that lose required fields during normalization", async () => {
  vi.spyOn(meritCore, "getItems").mockResolvedValue([
    { code: "FURNITURE", description: "Chair" },
    { code: "BROKEN", description: "" },
  ]);

  await expect(listItems(buildCredentials())).resolves.toEqual([
    expect.objectContaining({
      code: "FURNITURE",
      description: "Chair",
    }),
  ]);
});

it("uses fallback invoice fields when PIHId, DocDate, and PurchaseAccCode are absent", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      jsonResponse([
        {
          Id: "invoice-3",
          PIHId: "invoice-3",
          VendorId: "vendor-1",
          VendorName: "Vendor OÜ",
          TransactionDate: "20260419",
        },
      ]),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        Header: {
          PIHId: "invoice-3",
          VendorId: "vendor-1",
          VendorName: "Vendor OÜ",
          TransactionDate: "20260419",
        },
        Lines: [
          {
            ArticleCode: "FURNITURE",
            Description: "Desk",
          },
        ],
      }),
    );

  await expect(
    getVendorInvoiceHistory(buildCredentials(), {
      vendorId: "vendor-1",
      extraction: buildExtraction(),
    }),
  ).resolves.toEqual([
    expect.objectContaining({
      invoiceId: "invoice-3",
      issueDate: "20260419",
      purchaseAccountCode: undefined,
    }),
  ]);
});
