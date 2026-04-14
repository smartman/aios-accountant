import { describe, expect, it } from "vitest";
import {
  assertAccountingProvider,
  assertMeritCredentials,
  assertSmartAccountsCredentials,
  getProviderAdapter,
  parseAccountingCredentials,
  validateCredentialShape,
} from "./accounting-providers";

describe("accounting-providers", () => {
  it("parses SmartAccounts credentials from form data", () => {
    const formData = new FormData();
    formData.set("provider", "smartaccounts");
    formData.set("smartaccountsApiKey", " smart-api ");
    formData.set("smartaccountsSecretKey", " smart-secret ");

    expect(parseAccountingCredentials(formData)).toEqual({
      provider: "smartaccounts",
      credentials: {
        apiKey: "smart-api",
        secretKey: "smart-secret",
      },
    });

    const emptyForm = new FormData();
    emptyForm.set("provider", "smartaccounts");
    expect(parseAccountingCredentials(emptyForm)).toEqual({
      provider: "smartaccounts",
      credentials: {
        apiKey: "",
        secretKey: "",
      },
    });
  });

  it("parses Merit credentials from form data", () => {
    const formData = new FormData();
    formData.set("provider", "merit");
    formData.set("meritApiId", " merit-id ");
    formData.set("meritApiKey", " merit-key ");

    expect(parseAccountingCredentials(formData)).toEqual({
      provider: "merit",
      credentials: {
        apiId: "merit-id",
        apiKey: "merit-key",
      },
    });

    const emptyForm = new FormData();
    emptyForm.set("provider", "merit");
    expect(parseAccountingCredentials(emptyForm)).toEqual({
      provider: "merit",
      credentials: {
        apiId: "",
        apiKey: "",
      },
    });
  });

  it("validates provider choices and credential shapes", () => {
    expect(assertAccountingProvider("smartaccounts")).toBe("smartaccounts");
    expect(assertAccountingProvider("merit")).toBe("merit");
    expect(() => assertAccountingProvider("")).toThrow(
      "Please choose SmartAccounts or Merit.",
    );

    expect(() =>
      validateCredentialShape({
        provider: "smartaccounts",
        credentials: {
          apiKey: "",
          secretKey: "",
        },
      }),
    ).toThrow("SmartAccounts API key and secret key are required.");

    expect(() =>
      validateCredentialShape({
        provider: "merit",
        credentials: {
          apiId: "",
          apiKey: "",
        },
      }),
    ).toThrow("Merit API ID and API key are required.");

    expect(() =>
      validateCredentialShape({
        provider: "unsupported" as "smartaccounts",
        credentials: {
          apiKey: "x",
          secretKey: "y",
        },
      }),
    ).toThrow("Unsupported accounting provider.");
  });

  it("exposes the registered provider adapters", () => {
    expect(
      getProviderAdapter({
        provider: "smartaccounts",
        credentials: {
          apiKey: "smart-api",
          secretKey: "smart-secret",
        },
      }).provider,
    ).toBe("smartaccounts");

    expect(
      getProviderAdapter({
        provider: "merit",
        credentials: {
          apiId: "merit-id",
          apiKey: "merit-key",
        },
      }).provider,
    ).toBe("merit");
  });

  it("returns validated credential objects", () => {
    expect(
      assertSmartAccountsCredentials({ apiKey: "a", secretKey: "b" }).apiKey,
    ).toBe("a");
    expect(assertMeritCredentials({ apiId: "a", apiKey: "b" }).apiId).toBe("a");
  });
});
