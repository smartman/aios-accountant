import { expect, it } from "vitest";
import {
  buildPreviewDuplicateInvoice,
  buildPreviewArticleOptions,
  buildPreviewUnitOptions,
  chooseDefaultPaymentAccount,
  createRowId,
} from "./preview-helpers";

it("builds stable preview article options from the provider catalog", () => {
  expect(
    buildPreviewArticleOptions([
      {
        code: "ZETA",
        description: "Last",
        unit: "pcs",
        purchaseAccountCode: "4002",
        taxCode: "VAT22",
      },
      {
        code: "ALPHA",
        description: "First",
      },
    ]),
  ).toEqual([
    {
      code: "ALPHA",
      description: "First",
      unit: null,
      purchaseAccountCode: null,
      taxCode: null,
      type: null,
    },
    {
      code: "ZETA",
      description: "Last",
      unit: "pcs",
      purchaseAccountCode: "4002",
      taxCode: "VAT22",
      type: null,
    },
  ]);
});

it("builds duplicate invoice metadata only when vendor and invoice info exist", () => {
  expect(
    buildPreviewDuplicateInvoice({
      duplicateInvoiceId: "dup-1",
      vendorMatch: { vendorId: "vendor-1", vendorName: " Vendor OÜ " },
      invoiceNumber: " INV-1 ",
    }),
  ).toEqual({
    invoiceId: "dup-1",
    vendorName: "Vendor OÜ",
    invoiceNumber: "INV-1",
  });

  expect(
    buildPreviewDuplicateInvoice({
      duplicateInvoiceId: null,
      vendorMatch: { vendorId: "vendor-1", vendorName: "Vendor OÜ" },
      invoiceNumber: "INV-1",
    }),
  ).toBeNull();
});

it("builds unit options from provider context, catalog units, and defaults", () => {
  expect(
    buildPreviewUnitOptions({
      catalog: [{ code: "A", description: "One", unit: "pcs" }],
      context: {
        provider: "merit",
        referenceData: {
          accounts: [],
          taxCodes: [],
          paymentAccounts: [],
        },
        raw: {
          accounts: [],
          taxes: [],
          banks: [],
          paymentTypes: [],
          units: [{ code: "tk", name: "tk" }],
          items: [{ code: "A", description: "One", unit: "hour" }],
          vendors: [],
        },
      },
    }),
  ).toEqual(["hour", "pcs", "tk"]);

  expect(
    buildPreviewUnitOptions({
      catalog: [],
      context: {
        provider: "smartaccounts",
        referenceData: {
          accounts: [],
          taxCodes: [],
          paymentAccounts: [],
        },
        raw: {
          accounts: [],
          vatPcs: [],
          bankAccounts: [],
          cashAccounts: [],
          articles: [{ code: "A", description: "One", unit: "box" }],
        },
      },
    }),
  ).toEqual(["box", "pcs"]);
});

it("creates stable row ids", () => {
  expect(createRowId(2)).toBe("row-3");
});

it("chooses the default payment account by preferred type, currency, and fallback order", () => {
  const paymentAccounts = [
    { name: "Cash EUR", type: "CASH" as const, currency: "EUR" },
    { name: "Bank USD", type: "BANK" as const, currency: "USD" },
    { name: "Bank EUR", type: "BANK" as const, currency: "EUR" },
  ];

  expect(chooseDefaultPaymentAccount(paymentAccounts, "EUR", "BANK")).toBe(
    "Bank EUR",
  );
  expect(chooseDefaultPaymentAccount(paymentAccounts, "GBP", "BANK")).toBe(
    "Bank EUR",
  );
  expect(chooseDefaultPaymentAccount(paymentAccounts, "EUR", null)).toBe(
    "Bank EUR",
  );
  expect(chooseDefaultPaymentAccount(paymentAccounts, "EUR", "CASH")).toBe(
    "Cash EUR",
  );
  expect(chooseDefaultPaymentAccount(paymentAccounts, "GBP", "CASH")).toBe(
    "Cash EUR",
  );
  expect(chooseDefaultPaymentAccount([], "EUR", "BANK")).toBeNull();
});
