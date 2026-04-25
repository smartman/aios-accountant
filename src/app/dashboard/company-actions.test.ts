import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInitialCompany,
  deleteCompanyFromForm,
  inviteCompanyMember,
  removeCompanyInvitationFromForm,
  removeCompanyMemberFromForm,
  saveCompanyConfiguration,
  saveCompanyProfile,
} from "./actions";

const repository = vi.hoisted(() => ({
  createCompanyForUser: vi.fn(),
  deleteCompanyForUser: vi.fn(),
  inviteCompanyUser: vi.fn(),
  removeCompanyInvitation: vi.fn(),
  removeCompanyMember: vi.fn(),
  updateCompanyAccountingProvider: vi.fn(),
  updateCompanyConfiguration: vi.fn(),
  updateCompanyProfile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/workos", () => ({
  getUser: vi.fn(),
}));

vi.mock("@/lib/companies/repository", () => ({
  ...repository,
  requireCompanyForUser: vi.fn(),
}));

vi.mock("@/lib/user-accounting-connections", () => ({
  getStoredAccountingConnection: vi.fn(),
  upsertAccountingConnection: vi.fn(),
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

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { getUser } = await import("@/lib/workos");
  vi.mocked(getUser).mockResolvedValue({
    user: {
      id: "user-1",
      email: "user@example.com",
    } as never,
  });
  repository.createCompanyForUser.mockResolvedValue({ id: "company-1" });
  repository.updateCompanyProfile.mockResolvedValue({ id: "company-1" });
  repository.updateCompanyConfiguration.mockResolvedValue({ id: "company-1" });
});

describe("company dashboard actions", () => {
  it("creates the first company", async () => {
    const result = await createInitialCompany(
      { status: "idle" },
      formData({
        companyName: "Acme",
        countryCode: "EE",
        emtakCode: "69202",
        accountingProvider: "smartaccounts",
      }),
    );

    expect(repository.createCompanyForUser).toHaveBeenCalledWith({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
      name: "Acme",
      countryCode: "EE",
      emtakCode: "69202",
      accountingProvider: "smartaccounts",
    });
    expect(result).toEqual({
      status: "success",
      message: "Company created.",
      companyId: "company-1",
    });
  });

  it("saves company profile fields", async () => {
    const result = await saveCompanyProfile(
      { status: "idle" },
      formData({
        companyId: "company-1",
        companyName: "Acme",
        countryCode: "EE",
        emtakCode: "62010",
        accountingProvider: "merit",
      }),
    );

    expect(repository.updateCompanyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        accountingProvider: "merit",
      }),
    );
    expect(result.status).toBe("success");
  });

  it("saves accounting configuration forms", async () => {
    const result = await saveCompanyConfiguration(
      { status: "idle" },
      formData({
        companyId: "company-1",
        fixedAssetThreshold: "3000",
        carVatPolicy: "business-only",
        defaultUnit: "kg",
        projectName0: "Office",
        projectDimensionCode0: "OBJ-1",
      }),
    );

    expect(repository.updateCompanyConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        configuration: expect.objectContaining({
          fixedAssetThreshold: 3000,
          projects: [
            expect.objectContaining({
              name: "Office",
              providerDimensionCode: "OBJ-1",
            }),
          ],
        }),
      }),
    );
    expect(result.message).toBe("Company rules saved.");
  });
});

describe("company membership actions", () => {
  it("adds and removes company users", async () => {
    await inviteCompanyMember(
      { status: "idle" },
      formData({
        companyId: "company-1",
        email: "next@example.com",
      }),
    );
    await removeCompanyMemberFromForm(
      formData({
        companyId: "company-1",
        membershipId: "membership-1",
      }),
    );
    await removeCompanyInvitationFromForm(
      formData({
        companyId: "company-1",
        invitationId: "invitation-1",
      }),
    );

    expect(repository.inviteCompanyUser).toHaveBeenCalledOnce();
    expect(repository.removeCompanyMember).toHaveBeenCalledOnce();
    expect(repository.removeCompanyInvitation).toHaveBeenCalledOnce();
  });

  it("deletes a company and redirects to the dashboard", async () => {
    const { redirect } = await import("next/navigation");

    await deleteCompanyFromForm(
      formData({
        companyId: "company-1",
      }),
    );

    expect(repository.deleteCompanyForUser).toHaveBeenCalledWith({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
      companyId: "company-1",
    });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});

describe("company dashboard action errors", () => {
  it("returns action errors without throwing to the client", async () => {
    repository.createCompanyForUser.mockRejectedValueOnce("boom");

    await expect(
      createInitialCompany(
        { status: "idle" },
        formData({
          companyName: "Acme",
          countryCode: "EE",
          emtakCode: "69202",
          accountingProvider: "smartaccounts",
        }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Could not create company.",
    });
  });

  it("returns sign-in errors for company mutations", async () => {
    const { getUser } = await import("@/lib/workos");
    vi.mocked(getUser).mockResolvedValueOnce({ user: null });

    await expect(
      createInitialCompany(
        { status: "idle" },
        formData({
          companyName: "Acme",
          countryCode: "EE",
          emtakCode: "69202",
          accountingProvider: "smartaccounts",
        }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "You need to sign in before changing company settings.",
    });
  });

  it("preserves Error messages from failed company profile saves", async () => {
    repository.updateCompanyProfile.mockRejectedValueOnce(
      new Error("Company name is required."),
    );

    await expect(
      saveCompanyProfile(
        { status: "idle" },
        formData({
          companyId: "company-1",
          companyName: "",
          countryCode: "EE",
          emtakCode: "69202",
          accountingProvider: "smartaccounts",
        }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Company name is required.",
    });
  });

  it("uses fallback messages for non-Error invitation failures", async () => {
    repository.inviteCompanyUser.mockRejectedValueOnce("duplicate");

    await expect(
      inviteCompanyMember(
        { status: "idle" },
        formData({
          companyId: "company-1",
          email: "next@example.com",
        }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Could not add invitation.",
    });
  });
});
