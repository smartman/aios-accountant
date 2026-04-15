import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAccountingConnection } from "./actions";
import { getUser } from "@/lib/workos";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/workos", () => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/user-accounting-connections", () => ({
  upsertAccountingConnection: vi.fn(),
}));

vi.mock("@/lib/smartaccounts-adapter", () => ({
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
      import("@/lib/smartaccounts-adapter"),
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
      import("@/lib/smartaccounts-adapter"),
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
      import("@/lib/smartaccounts-adapter"),
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
