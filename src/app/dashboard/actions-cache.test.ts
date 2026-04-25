import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredAccountingConnection } from "@/lib/user-accounting-connections";
import {
  clearAccountingConnectionCache,
  clearAccountingConnectionCacheFromForm,
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

vi.mock("@/lib/companies/repository", () => ({
  requireCompanyForUser: vi.fn(async ({ companyId }) => ({
    id: companyId || "company-1",
    name: "Test company",
    countryCode: "EE",
    emtakCode: "69202",
    emtakLabel: "Bookkeeping",
    accountingProvider: "smartaccounts",
    configuration: {},
    connectionSummary: null,
    members: [],
    invitations: [],
  })),
  updateCompanyAccountingProvider: vi.fn(),
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

const TEST_USER = {
  id: "vitest-dashboard-user",
  email: "vitest@example.com",
} as never;
const VERIFIED_AT = new Date("2026-04-14T09:00:00.000Z").toISOString();

function makeConnection(provider: "smartaccounts" | "merit") {
  return {
    workosUserId: "vitest-dashboard-user",
    provider,
    credentials:
      provider === "smartaccounts"
        ? {
            provider,
            credentials: {
              apiKey: "public",
              secretKey: "secret",
            },
          }
        : {
            provider,
            credentials: {
              apiId: "merit-id",
              apiKey: "merit-key",
            },
          },
    summary: {
      provider,
      label: provider === "smartaccounts" ? "SmartAccounts" : "Merit",
      detail: "Verified",
      verifiedAt: VERIFIED_AT,
    },
    verifiedAt: new Date(VERIFIED_AT),
  } as StoredAccountingConnection;
}

async function loadCacheModules() {
  return Promise.all([
    import("@/lib/workos"),
    import("@/lib/user-accounting-connections"),
    import("@/lib/accounting-provider-cache"),
    import("next/cache"),
  ]);
}

function formDataForCompany(companyId = "company-1"): FormData {
  const formData = new FormData();
  formData.set("companyId", companyId);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clearAccountingConnectionCache errors", () => {
  it("returns an auth error when no user is signed in", async () => {
    vi.mocked(getUser).mockResolvedValue({ user: null });

    const result = await clearAccountingConnectionCache(
      { status: "idle", message: "" },
      formDataForCompany(),
    );

    expect(result).toEqual({
      status: "error",
      message: "You need to sign in before clearing cached values.",
    });
  });

  it("returns an error when no company is selected", async () => {
    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });

    const result = await clearAccountingConnectionCache({
      status: "idle",
      message: "",
    });

    expect(result).toEqual({
      status: "error",
      message: "Choose a company before clearing cache values.",
    });
  });

  it("returns an error if no accounting connection exists", async () => {
    const [{ getUser }, { getStoredAccountingConnection }] =
      await loadCacheModules();

    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(null);

    const result = await clearAccountingConnectionCache(
      { status: "idle", message: "" },
      formDataForCompany(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Connect a provider before clearing cache values.",
    });
  });
});

describe("clearAccountingConnectionCache success paths", () => {
  it("clears provider caches and revalidates the dashboard", async () => {
    const expectedConnection = makeConnection("smartaccounts");
    const [
      { getUser },
      { getStoredAccountingConnection },
      { clearStoredConnectionCache },
      { revalidatePath },
    ] = await loadCacheModules();

    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      expectedConnection,
    );

    const result = await clearAccountingConnectionCache(
      { status: "idle", message: "" },
      formDataForCompany("company-1"),
    );

    expect(clearStoredConnectionCache).toHaveBeenCalledWith(expectedConnection);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual({
      status: "success",
      message: "Cached values cleared.",
    });
  });

  it("returns a generic error for non-Error failures", async () => {
    const expectedConnection = makeConnection("merit");
    const [
      { getUser },
      { getStoredAccountingConnection },
      { clearStoredConnectionCache },
    ] = await loadCacheModules();

    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      expectedConnection,
    );
    vi.mocked(clearStoredConnectionCache).mockImplementation(() => {
      throw "failed to clear";
    });

    const result = await clearAccountingConnectionCache(
      { status: "idle", message: "" },
      formDataForCompany("company-1"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Could not clear cached values.",
    });
  });

  it("supports form actions by delegating to the cache clear workflow", async () => {
    const [
      { getUser },
      { getStoredAccountingConnection },
      { clearStoredConnectionCache },
    ] = await loadCacheModules();

    vi.mocked(getUser).mockResolvedValue({ user: TEST_USER });
    vi.mocked(getStoredAccountingConnection).mockResolvedValue(
      makeConnection("smartaccounts"),
    );

    await expect(
      clearAccountingConnectionCacheFromForm(formDataForCompany()),
    ).resolves.toBeUndefined();
    expect(clearStoredConnectionCache).toHaveBeenCalledOnce();
  });
});
