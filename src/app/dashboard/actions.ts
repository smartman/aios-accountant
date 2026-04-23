"use server";

import { revalidatePath } from "next/cache";
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
import type { ClearCacheState, SaveConnectionState } from "./action-state";

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
    const credentials = parseAccountingCredentials(formData);
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
      workosUserId: user.id,
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
  previousState: ClearCacheState,
): Promise<ClearCacheState> {
  void previousState;
  const { user } = await getUser();
  if (!user?.id) {
    return {
      status: "error",
      message: "You need to sign in before clearing cached values.",
    };
  }

  const savedConnection = await getStoredAccountingConnection(user.id);
  if (!savedConnection) {
    return {
      status: "error",
      message: "Connect a provider before clearing cache values.",
    };
  }

  try {
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
  void formData;
  await clearAccountingConnectionCache({
    status: "idle",
  });
}
