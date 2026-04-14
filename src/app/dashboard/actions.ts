"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/workos";
import {
  parseAccountingCredentials,
  validateCredentialShape,
} from "@/lib/accounting-providers";
import { meritProviderAdapter } from "@/lib/merit";
import { smartAccountsProviderAdapter } from "@/lib/smartaccounts-adapter";
import { upsertAccountingConnection } from "@/lib/user-accounting-connections";
import type { SaveConnectionState } from "./action-state";

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
