import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { getMeritCacheNamespace, signMeritRequest } from "./merit";
import {
  getSmartAccountsCacheNamespace,
  signSmartAccountsRequest,
} from "./smartaccounts";

describe("provider signing and namespacing", () => {
  it("creates stable SmartAccounts cache namespaces per credential set", () => {
    const a = getSmartAccountsCacheNamespace({
      apiKey: "api-a",
      secretKey: "secret-a",
    });
    const b = getSmartAccountsCacheNamespace({
      apiKey: "api-a",
      secretKey: "secret-a",
    });
    const c = getSmartAccountsCacheNamespace({
      apiKey: "api-b",
      secretKey: "secret-b",
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("creates stable Merit cache namespaces per credential set", () => {
    const a = getMeritCacheNamespace({
      apiId: "id-a",
      apiKey: "key-a",
    });
    const b = getMeritCacheNamespace({
      apiId: "id-a",
      apiKey: "key-a",
    });
    const c = getMeritCacheNamespace({
      apiId: "id-b",
      apiKey: "key-b",
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("signs SmartAccounts requests with HMAC-SHA256 hex", () => {
    const query = "timestamp=20260414000000&apikey=public";
    const body = '{"hello":"world"}';
    const secretKey = "secret-key";

    const expected = crypto
      .createHmac("sha256", secretKey)
      .update(query + body, "utf8")
      .digest("hex");

    expect(
      signSmartAccountsRequest(query, body, {
        apiKey: "public",
        secretKey,
      }),
    ).toBe(expected);
  });

  it("signs Merit requests with HMAC-SHA256 base64", () => {
    const credentials = {
      apiId: "670fe52f-558a-4be8-ade0-526e01a106d0",
      apiKey: "merit-secret",
    };
    const timestamp = "20240624205902";
    const body = '{"OnlyActive":true}';
    const expected = crypto
      .createHmac("sha256", Buffer.from(credentials.apiKey, "ascii"))
      .update(`${credentials.apiId}${timestamp}${body}`, "utf8")
      .digest("base64");

    expect(signMeritRequest(credentials, timestamp, body)).toBe(expected);
  });
});
