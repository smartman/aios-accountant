"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/workos";
import { clearStoredConnectionCache } from "@/lib/accounting-provider-cache";
import {
  parseAccountingCredentials,
  validateCredentialShape,
} from "@/lib/accounting-providers";
import { meritProviderAdapter } from "@/lib/merit";
import { smartAccountsProviderAdapter } from "@/lib/smartaccounts";
import {
  getStoredAccountingConnection,
  upsertAccountingConnection,
} from "@/lib/user-accounting-connections";
import {
  createCompanyForUser,
  deleteCompanyForUser,
  inviteCompanyUser,
  removeCompanyInvitation,
  removeCompanyMember,
  requireCompanyForUser,
  updateCompanyAccountingProvider,
  updateCompanyConfiguration,
  updateCompanyProfile,
} from "@/lib/companies/repository";
import { parseCompanyConfigurationForm } from "@/lib/companies/configuration";
import type {
  ClearCacheState,
  CompanyActionState,
  SaveConnectionState,
} from "./action-state";

function getFormString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function getActionUser() {
  const { user } = await getUser();
  if (!user?.id) {
    throw new Error("You need to sign in before changing company settings.");
  }

  return {
    id: user.id,
    email: user.email,
  };
}

function toActionError(error: unknown, fallback: string): CompanyActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export async function createInitialCompany(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  try {
    const user = await getActionUser();
    const company = await createCompanyForUser({
      user,
      name: getFormString(formData, "companyName"),
      countryCode: getFormString(formData, "countryCode"),
      emtakCode: getFormString(formData, "emtakCode"),
      accountingProvider: getFormString(formData, "accountingProvider"),
    });

    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Company created.",
      companyId: company.id,
    };
  } catch (error) {
    return toActionError(error, "Could not create company.");
  }
}

export async function saveCompanyProfile(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  try {
    const user = await getActionUser();
    const company = await updateCompanyProfile({
      user,
      companyId: getFormString(formData, "companyId"),
      name: getFormString(formData, "companyName"),
      countryCode: getFormString(formData, "countryCode"),
      emtakCode: getFormString(formData, "emtakCode"),
      accountingProvider: getFormString(formData, "accountingProvider"),
    });

    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Company profile saved.",
      companyId: company.id,
    };
  } catch (error) {
    return toActionError(error, "Could not save company profile.");
  }
}

export async function saveCompanyConfiguration(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  try {
    const user = await getActionUser();
    const company = await updateCompanyConfiguration({
      user,
      companyId: getFormString(formData, "companyId"),
      configuration: parseCompanyConfigurationForm(formData),
    });

    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Company rules saved.",
      companyId: company.id,
    };
  } catch (error) {
    return toActionError(error, "Could not save company rules.");
  }
}

export async function inviteCompanyMember(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  try {
    const user = await getActionUser();
    await inviteCompanyUser({
      user,
      companyId: getFormString(formData, "companyId"),
      email: getFormString(formData, "email"),
    });

    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Invitation added.",
      companyId: getFormString(formData, "companyId"),
    };
  } catch (error) {
    return toActionError(error, "Could not add invitation.");
  }
}

export async function removeCompanyMemberFromForm(
  formData: FormData,
): Promise<void> {
  const user = await getActionUser();
  await removeCompanyMember({
    user,
    companyId: getFormString(formData, "companyId"),
    membershipId: getFormString(formData, "membershipId"),
  });
  revalidatePath("/dashboard");
}

export async function removeCompanyInvitationFromForm(
  formData: FormData,
): Promise<void> {
  const user = await getActionUser();
  await removeCompanyInvitation({
    user,
    companyId: getFormString(formData, "companyId"),
    invitationId: getFormString(formData, "invitationId"),
  });
  revalidatePath("/dashboard");
}

export async function deleteCompanyFromForm(formData: FormData): Promise<void> {
  const user = await getActionUser();
  await deleteCompanyForUser({
    user,
    companyId: getFormString(formData, "companyId"),
  });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function saveAccountingConnection(
  _previousState: SaveConnectionState,
  formData: FormData,
): Promise<SaveConnectionState> {
  const { user } = await getUser();
  if (!user?.id) {
    return {
      status: "error",
      message: "You need to sign in before saving accounting credentials.",
    };
  }

  try {
    const company = await requireCompanyForUser({
      companyId: getFormString(formData, "companyId"),
      user: {
        id: user.id,
        email: user.email,
      },
    });
    const credentials = parseAccountingCredentials(formData);
    if (credentials.provider !== company.accountingProvider) {
      await updateCompanyAccountingProvider({
        companyId: company.id,
        user: {
          id: user.id,
          email: user.email,
        },
        accountingProvider: credentials.provider,
      });
    }
    validateCredentialShape(credentials);

    const summary =
      credentials.provider === "smartaccounts"
        ? await smartAccountsProviderAdapter.validateCredentials(
            credentials.credentials,
          )
        : await meritProviderAdapter.validateCredentials(
            credentials.credentials,
          );

    await upsertAccountingConnection({
      companyId: company.id,
      credentials,
      summary,
    });

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `${summary.label} credentials saved and verified.`,
      provider: credentials.provider,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not save accounting credentials.",
    };
  }
}

export async function clearAccountingConnectionCache(
  _previousState: ClearCacheState,
  formData?: FormData,
): Promise<ClearCacheState> {
  const { user } = await getUser();
  if (!user?.id) {
    return {
      status: "error",
      message: "You need to sign in before clearing cached values.",
    };
  }

  const companyId = formData ? getFormString(formData, "companyId") : "";
  if (!companyId) {
    return {
      status: "error",
      message: "Choose a company before clearing cache values.",
    };
  }

  try {
    await requireCompanyForUser({
      companyId,
      user: {
        id: user.id,
        email: user.email,
      },
    });
    const savedConnection = await getStoredAccountingConnection(companyId);
    if (!savedConnection) {
      return {
        status: "error",
        message: "Connect a provider before clearing cache values.",
      };
    }

    clearStoredConnectionCache(savedConnection);
    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Cached values cleared.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not clear cached values.",
    };
  }
}

export async function clearAccountingConnectionCacheFromForm(
  formData: FormData,
): Promise<void> {
  await clearAccountingConnectionCache(
    {
      status: "idle",
    },
    formData,
  );
}
