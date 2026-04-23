import { expect, it } from "vitest";
import {
  deriveInvoiceRoundingAmount,
  derivePreciseUnitPrice,
  isFiniteAmount,
  resolveAuthoritativeRowNetAmount,
  roundCurrencyAmount,
} from "./amounts";

it("identifies finite amounts and rounds currency values", () => {
  expect(isFiniteAmount(1.23)).toBe(true);
  expect(isFiniteAmount(Number.NaN)).toBe(false);
  expect(isFiniteAmount(null)).toBe(false);
  expect(roundCurrencyAmount(13.845)).toBe(13.85);
});

it("resolves authoritative row net amounts from sums and derived totals", () => {
  expect(
    resolveAuthoritativeRowNetAmount({
      quantity: 37,
      price: 0.16,
      sum: 6.06,
    }),
  ).toBe(6.06);
  expect(
    resolveAuthoritativeRowNetAmount({
      quantity: 2,
      price: 50,
      sum: null,
    }),
  ).toBe(100);
  expect(
    resolveAuthoritativeRowNetAmount({
      quantity: null,
      price: null,
      sum: null,
    }),
  ).toBeUndefined();
});

it("derives precise unit prices for summed, zero-quantity, and price-only rows", () => {
  expect(
    derivePreciseUnitPrice({
      quantity: 37,
      price: 0.16,
      sum: 6.06,
    }),
  ).toBe(0.1637838);
  expect(
    derivePreciseUnitPrice({
      quantity: 0,
      price: 12.34567,
      sum: null,
    }),
  ).toBe(12.34567);
  expect(
    derivePreciseUnitPrice({
      quantity: 0,
      price: null,
      sum: 9.87654,
    }),
  ).toBe(9.87654);
  expect(
    derivePreciseUnitPrice({
      quantity: 0,
      price: null,
      sum: null,
    }),
  ).toBeUndefined();
  expect(
    derivePreciseUnitPrice({
      quantity: 1,
      price: 15.4321,
      sum: null,
    }),
  ).toBe(15.4321);
});

it("derives invoice rounding amounts only when all header amounts are present", () => {
  expect(
    deriveInvoiceRoundingAmount({
      amountExcludingVat: 62.92,
      vatAmount: 13.84,
      totalAmount: 76.77,
    }),
  ).toBe(0.01);
  expect(
    deriveInvoiceRoundingAmount({
      amountExcludingVat: 62.92,
      vatAmount: null,
      totalAmount: 76.77,
    }),
  ).toBe(0);
});
