import { describe, expect, it } from "vitest";
import {
  assertProviderContext,
  getCredentialFingerprint,
  getProviderLabel,
  isMeritCredentials,
  isSmartAccountsCredentials,
  isSmartAccountsVendor,
  toSafeIsoString,
  type ProviderRuntimeContext,
} from "./accounting-provider-types";

function buildContext(
  provider: "smartaccounts" | "merit",
): ProviderRuntimeContext {
  if (provider === "smartaccounts") {
    return {
      provider,
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
        articles: [],
      },
    };
  }

  return {
    provider,
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
      items: [],
      vendors: [],
    },
  };
}

describe("accounting-provider-types helpers", () => {
  it("narrows provider contexts and throws on mismatches", () => {
    expect(
      assertProviderContext(buildContext("smartaccounts"), "smartaccounts")
        .provider,
    ).toBe("smartaccounts");
    expect(() =>
      assertProviderContext(buildContext("merit"), "smartaccounts"),
    ).toThrow(
      "Provider context mismatch. Expected smartaccounts, received merit.",
    );
  });

  it("identifies credential variants", () => {
    expect(
      isSmartAccountsCredentials({
        provider: "smartaccounts",
        credentials: {
          apiKey: "smart-api",
          secretKey: "smart-secret",
        },
      }),
    ).toBe(true);
    expect(
      isMeritCredentials({
        provider: "merit",
        credentials: {
          apiId: "merit-id",
          apiKey: "merit-key",
        },
      }),
    ).toBe(true);
  });

  it("returns stable fingerprints and labels", () => {
    expect(getCredentialFingerprint({ provider: "smartaccounts", id: 1 })).toBe(
      '{"provider":"smartaccounts","id":1}',
    );
    expect(getProviderLabel("smartaccounts")).toBe("SmartAccounts");
    expect(getProviderLabel("merit")).toBe("Merit");
  });

  it("normalizes ISO strings and vendor shapes", () => {
    expect(toSafeIsoString(new Date("2026-04-14T09:00:00.000Z"))).toBe(
      "2026-04-14T09:00:00.000Z",
    );
    expect(toSafeIsoString("2026-04-14")).toContain("2026-04-14");
    expect(isSmartAccountsVendor({ id: "vendor-1", name: "Vendor OÜ" })).toBe(
      true,
    );
    expect(isSmartAccountsVendor({ id: "vendor-1" })).toBe(false);
    expect(isSmartAccountsVendor(null)).toBe(false);
  });
});
