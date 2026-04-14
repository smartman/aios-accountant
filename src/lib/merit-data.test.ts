import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVendor,
  findExistingPurchaseInvoice,
  findVendor,
} from "./merit-data";
import { clearMeritCachesForTests } from "./merit-core";

function buildCredentials(seed: string) {
  return {
    apiId: `merit-id-${seed}`,
    apiKey: `merit-key-${seed}`,
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
  clearMeritCachesForTests();
});

describe("merit-data vendor lookup", () => {
  it("returns null without a usable search term and prioritizes reg number searches", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse([
          { VendorId: "vendor-1", Name: "Vendor OÜ", RegNo: "123" },
        ]),
      );

    await expect(findVendor(buildCredentials("none"), {})).resolves.toBeNull();
    await expect(
      findVendor(buildCredentials("reg"), {
        regNo: "123",
        vatRegNo: "EE123",
        name: "Vendor OÜ",
      }),
    ).resolves.toEqual({
      id: "vendor-1",
      name: "Vendor OÜ",
      regNo: "123",
      vatRegNo: undefined,
      bankAccount: undefined,
      referenceNo: undefined,
      address: undefined,
      city: undefined,
      county: undefined,
      postalCode: undefined,
      countryCode: undefined,
      email: undefined,
      phoneNo: undefined,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"RegNo":"123"');
  });

  it("drops nameless vendors from search results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([{ VendorId: "vendor-1" }]),
    );

    await expect(
      findVendor(buildCredentials("invalid"), { name: "No name" }),
    ).resolves.toBeNull();
  });
});

describe("merit-data vendor creation", () => {
  it("caches newly created vendors for reg, vat, and name searches", async () => {
    const credentials = buildCredentials("create");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ Id: "vendor-2", Name: "Vendor OÜ" }));

    await expect(
      createVendor(credentials, {
        name: "Vendor OÜ",
        regNo: "12345678",
        vatRegNo: "EE123456789",
        bankAccount: "EE123",
      }),
    ).resolves.toMatchObject({
      id: "vendor-2",
      name: "Vendor OÜ",
      regNo: "12345678",
      vatRegNo: "EE123456789",
    });

    await expect(
      findVendor(credentials, { regNo: "12345678" }),
    ).resolves.toMatchObject({ id: "vendor-2" });
    await expect(
      findVendor(credentials, { vatRegNo: "EE123456789" }),
    ).resolves.toMatchObject({
      id: "vendor-2",
    });
    await expect(
      findVendor(credentials, { name: "Vendor OÜ" }),
    ).resolves.toMatchObject({ id: "vendor-2" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the submitted vendor name when the API omits it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ Id: "vendor-3" }),
    );

    await expect(
      createVendor(buildCredentials("fallback"), {
        name: "Fallback Vendor",
      }),
    ).resolves.toEqual({
      id: "vendor-3",
      name: "Fallback Vendor",
      regNo: undefined,
      vatRegNo: undefined,
      bankAccount: undefined,
      referenceNo: undefined,
      address: undefined,
      city: undefined,
      county: undefined,
      postalCode: undefined,
      countryCode: undefined,
      email: undefined,
      phoneNo: undefined,
    });
  });
});

describe("merit-data purchase invoice lookup", () => {
  it("matches purchase invoices by bill and vendor id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        { PIHId: "other", BillNo: "INV-1", VendorId: "vendor-2" },
        { PIHId: "invoice-1", BillNo: "INV-1", VendorId: "vendor-1" },
      ]),
    );

    await expect(
      findExistingPurchaseInvoice(buildCredentials("invoice"), {
        vendorId: "vendor-1",
        invoiceNumber: "INV-1",
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
            invoiceNumber: "INV-1",
            referenceNumber: null,
            currency: "EUR",
            issueDate: "2026-04-14",
            dueDate: null,
            entryDate: "2026-04-14",
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
    ).resolves.toEqual({ invoiceId: "invoice-1" });
  });

  it("returns null when the matched invoice has no PIHId or the date is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([{ BillNo: "INV-2", VendorId: "vendor-1" }]),
    );

    await expect(
      findExistingPurchaseInvoice(buildCredentials("null"), {
        vendorId: "vendor-1",
        invoiceNumber: "INV-2",
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
            invoiceNumber: "INV-2",
            referenceNumber: null,
            currency: "EUR",
            issueDate: "bad-date",
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
    ).resolves.toBeNull();
  });
});
