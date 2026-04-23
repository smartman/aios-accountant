import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredAccountingConnection } from "@/lib/user-accounting-connections";
import {
  clearAccountingConnectionCache,
  clearAccountingConnectionCacheFromForm,
  saveAccountingConnection,
} from "./actions";
import { getUser } from "@/lib/workos";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/workos", () => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/user-accounting-connections", () => ({
  upsertAccountingConnection: vi.fn(),
  getStoredAccountingConnection: vi.fn(),
}));

vi.mock("@/lib/accounting-provider-cache", () => ({
  clearStoredConnectionCache: vi.fn(),
}));

vi.mock("@/lib/smartaccounts", () => ({
  smartAccountsProviderAdapter: {
    validateCredentials: vi.fn(),
  },
}));

vi.mock("@/lib/merit", () => ({
  meritProviderAdapter: {
    validateCredentials: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const VERIFIED_AT = new Date("2026-04-14T09:00:00.000Z").toISOString();
const TEST_USER = {
  id: "vitest-dashboard-user",
  email: "vitest@example.com",
} as never;
const TEST_VERIFIED_AT = new Date(VERIFIED_AT);

function makeConnection(
  provider: "smartaccounts",
  credentials: { apiKey: string; secretKey: string },
): StoredAccountingConnection;
function makeConnection(
  provider: "merit",
  credentials: { apiId: string; apiKey: string },
): StoredAccountingConnection;
function makeConnection(
  provider: "smartaccounts" | "merit",
  credentials: { apiKey: string; secretKey?: string; apiId?: string },
): StoredAccountingConnection {
  if (provider === "smartaccounts") {
    return {
      workosUserId: "vitest-dashboard-user",
      provider,
      credentials: {
        provider: "smartaccounts",
        credentials: {
          apiKey: credentials.apiKey,
          secretKey: credentials.secretKey ?? "",
        },
      },
      summary: {
        provider,
        label: "SmartAccounts",
        detail: "Verified",
        verifiedAt: VERIFIED_AT,
      },
      verifiedAt: TEST_VERIFIED_AT,
    };
  }

  return {
    workosUserId: "vitest-dashboard-user",
    provider,
    credentials: {
      provider: "merit",
      credentials: {
        apiId: credentials.apiId as string,
        apiKey: credentials.apiKey,
      },
    },
    summary: {
      provider,
      label: "Merit",
      detail: "Verified",
      verifiedAt: VERIFIED_AT,
    },
    verifiedAt: TEST_VERIFIED_AT,
  };
}

async function loadClearCacheModules() {
  return Promise.all([
    import("./actions"),
    import("@/lib/workos"),
    import("@/lib/user-accounting-connections"),
    import("@/lib/accounting-provider-cache"),
    import("next/cache"),
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveAccountingConnection", () => {
  it("returns an auth error when no user is signed in", async () => {
    vi.mocked(getUser).mockResolvedValue({ user: null });

    const result = await saveAccountingConnection(
      { status: "idle", message: "" },
      new FormData(),
    );

    expect(result).toEqual({
      status: "error",
      message: "You need to sign in before saving accounting credentials.",
    });
  });
});

describe("saveAccountingConnection success cases", () => {
  it("saves and revalidates SmartAccounts credentials on success", async () => {
    const [
      { saveAccountingConnection },
      { getUser },
      { upsertAccountingConnection },
      { smartAccountsProviderAdapter },
      { revalidatePath },
    ] = await Promise.all([
      import("./actions"),
      import("@/lib/workos"),
      import("@/lib/user-accounting-connections"),
      import("@/lib/smartaccounts"),
      import("next/cache"),
    ]);

    vi.mocked(getUser).mockResolvedValue({
      user: {
        id: "vitest-dashboard-user",
        email: "vitest@example.com",
      } as never,
    });
    vi.mocked(
      smartAccountsProviderAdapter.validateCredentials,
    ).mockResolvedValue({
      provider: "smartaccounts",
      label: "SmartAccounts",
      detail: "SmartAccounts credentials verified successfully.",
      verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
      publicId: "smart-api",
      secretMasked: "*******ret",
    });

    const formData = new FormData();
    formData.set("provider", "smartaccounts");
    formData.set("smartaccountsApiKey", "smart-api");
    formData.set("smartaccountsSecretKey", "smart-secret");

    const result = await saveAccountingConnection(
      { status: "idle", message: "" },
      formData,
    );

    expect(upsertAccountingConnection).toHaveBeenCalledWith({
      workosUserId: "vitest-dashboard-user",
      credentials: {
        provider: "smartaccounts",
        credentials: {
          apiKey: "smart-api",
          secretKey: "smart-secret",
        },
      },
      summary: expect.objectContaining({
        provider: "smartaccounts",
        label: "SmartAccounts",
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual({
      status: "success",
      message: "SmartAccounts credentials saved and verified.",
      provider: "smartaccounts",
    });
  });

  it("uses the Merit adapter for Merit credentials", async () => {
    const [
      { saveAccountingConnection },
      { getUser },
      { meritProviderAdapter },
    ] = await Promise.all([
      import("./actions"),
      import("@/lib/workos"),
      import("@/lib/merit"),
    ]);

    vi.mocked(getUser).mockResolvedValue({
      user: {
        id: "vitest-dashboard-user",
        email: "vitest@example.com",
      } as never,
    });
    vi.mocked(meritProviderAdapter.validateCredentials).mockResolvedValue({
      provider: "merit",
      label: "Merit",
      detail: "Merit credentials verified successfully.",
      verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
      publicId: "merit-id",
      secretMasked: "*****key",
    });

    const formData = new FormData();
    formData.set("provider", "merit");
    formData.set("meritApiId", "merit-id");
    formData.set("meritApiKey", "merit-key");

    const result = await saveAccountingConnection(
      { status: "idle", message: "" },
      formData,
    );

    expect(meritProviderAdapter.validateCredentials).toHaveBeenCalledWith({
      apiId: "merit-id",
      apiKey: "merit-key",
    });
    expect(result.provider).toBe("merit");
  });
});

describe("saveAccountingConnection failure cases", () => {
  it("does not persist changes when validation fails", async () => {
    const [
      { saveAccountingConnection },
      { getUser },
      { upsertAccountingConnection },
      { smartAccountsProviderAdapter },
    ] = await Promise.all([
      import("./actions"),
      import("@/lib/workos"),
      import("@/lib/user-accounting-connections"),
      import("@/lib/smartaccounts"),
    ]);

    vi.mocked(getUser).mockResolvedValue({
      user: {
        id: "vitest-dashboard-user",
        email: "vitest@example.com",
      } as never,
    });
    vi.mocked(
      smartAccountsProviderAdapter.validateCredentials,
    ).mockRejectedValue(new Error("Invalid SmartAccounts credentials"));

    const formData = new FormData();
    formData.set("provider", "smartaccounts");
    formData.set("smartaccountsApiKey", "bad-api");
    formData.set("smartaccountsSecretKey", "bad-secret");

    const result = await saveAccountingConnection(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Invalid SmartAccounts credentials",
    });
    expect(upsertAccountingConnection).not.toHaveBeenCalled();
  });

  it("returns a generic error message for non-Error throws", async () => {
    const [
      { saveAccountingConnection },
      { getUser },
      { smartAccountsProviderAdapter },
    ] = await Promise.all([
      import("./actions"),
      import("@/lib/workos"),
      import("@/lib/smartaccounts"),
    ]);

    vi.mocked(getUser).mockResolvedValue({
      user: {
        id: "vitest-dashboard-user",
        email: "vitest@example.com",
      } as never,
    });
    vi.mocked(
      smartAccountsProviderAdapter.validateCredentials,
    ).mockRejectedValue("boom");

    const formData = new FormData();
    formData.set("provider", "smartaccounts");
    formData.set("smartaccountsApiKey", "bad-api");
    formData.set("smartaccountsSecretKey", "bad-secret");

    const result = await saveAccountingConnection(
      { status: "idle", message: "" },
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Could not save accounting credentials.",
    });
  });
});

describe("clearAccountingConnectionCache errors", () => {
  it("returns an auth error when no user is signed in", async () => {
    vi.mocked(getUser).mockResolvedValue({ user: null });

    const result = await clearAccountingConnectionCache({
      status: "idle",
      message: "",
    });

    expect(result).toEqual({
      status: "error",
      message: "You need to sign in before clearing cached values.",
    });
  });

  it("returns an error if no accounting connection exists", async () => {
    const [
      { clearAccountingConnectionCache },
      { getUser },
      { getStoredAccountingConnection },
    ] = await Promise.all([
      import("./actions"),
      import("@/lib/workos"),
      import("@/lib/user-accounting-connections"),
    ]);

    vi.mocked(getUser).mockResolvedValue({
      user: {
        id: "vitest-dashboard-user",
        email: "vitest@example.com",
      } as never,
    });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(null);

    const result = await clearAccountingConnectionCache({
      status: "idle",
      message: "",
    });

    expect(result).toEqual({
      status: "error",
      message: "Connect a provider before clearing cache values.",
    });
  });

  it("clears provider caches and revalidates the dashboard", async () => {
    const expectedConnection = makeConnection("smartaccounts", {
      apiKey: "public",
      secretKey: "secret",
    });
    const [
      { clearAccountingConnectionCache },
      { getUser },
      { getStoredAccountingConnection },
      { clearStoredConnectionCache },
      { revalidatePath },
    ] = await loadClearCacheModules();

    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      expectedConnection,
    );

    const result = await clearAccountingConnectionCache({
      status: "idle",
      message: "",
    });

    expect(clearStoredConnectionCache).toHaveBeenCalledWith(expectedConnection);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual({
      status: "success",
      message: "Cached values cleared.",
    });
  });

  it("returns a generic error for non-Error failures", async () => {
    const expectedConnection = makeConnection("merit", {
      apiId: "merit-id",
      apiKey: "merit-key",
    });
    const [
      { clearAccountingConnectionCache },
      { getUser },
      { getStoredAccountingConnection },
      { clearStoredConnectionCache },
    ] = await Promise.all([
      import("./actions"),
      import("@/lib/workos"),
      import("@/lib/user-accounting-connections"),
      import("@/lib/accounting-provider-cache"),
    ]);

    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      expectedConnection,
    );
    vi.mocked(clearStoredConnectionCache).mockImplementation(() => {
      throw "failed to clear";
    });

    const result = await clearAccountingConnectionCache({
      status: "idle",
      message: "",
    });

    expect(result).toEqual({
      status: "error",
      message: "Could not clear cached values.",
    });
  });
});

describe("clearAccountingConnectionCache success paths", () => {
  it("supports form actions by delegating to the cache clear workflow", async () => {
    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    const [{ getStoredAccountingConnection }, { clearStoredConnectionCache }] =
      await Promise.all([
        import("@/lib/user-accounting-connections"),
        import("@/lib/accounting-provider-cache"),
      ]);

    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      makeConnection("smartaccounts", {
        apiKey: "public",
        secretKey: "secret",
      }),
    );

    await expect(
      clearAccountingConnectionCacheFromForm(new FormData()),
    ).resolves.toBeUndefined();
    expect(clearStoredConnectionCache).toHaveBeenCalledOnce();
  });
});
