import {
  AccountingCredentials,
  AccountingProvider,
  MeritCredentials,
  SmartAccountsCredentials,
  isMeritCredentials,
  isSmartAccountsCredentials,
} from "./accounting-provider-types";
import { meritProviderAdapter } from "./merit";
import { smartAccountsProviderAdapter } from "./smartaccounts-adapter";

export const accountingProviders = {
  smartaccounts: smartAccountsProviderAdapter,
  merit: meritProviderAdapter,
} as const;

export function assertAccountingProvider(
  value: string | null | undefined,
): AccountingProvider {
  if (value === "smartaccounts" || value === "merit") {
    return value;
  }

  throw new Error("Please choose SmartAccounts or Merit.");
}

export function parseAccountingCredentials(
  formData: FormData,
): AccountingCredentials {
  const provider = assertAccountingProvider(
    String(formData.get("provider") ?? ""),
  );

  if (provider === "smartaccounts") {
    return {
      provider,
      credentials: {
        apiKey: String(formData.get("smartaccountsApiKey") ?? "").trim(),
        secretKey: String(formData.get("smartaccountsSecretKey") ?? "").trim(),
      },
    };
  }

  return {
    provider,
    credentials: {
      apiId: String(formData.get("meritApiId") ?? "").trim(),
      apiKey: String(formData.get("meritApiKey") ?? "").trim(),
    },
  };
}

export function validateCredentialShape(
  credentials: AccountingCredentials,
): void {
  if (isSmartAccountsCredentials(credentials)) {
    assertSmartAccountsCredentials(credentials.credentials);
    return;
  }

  if (isMeritCredentials(credentials)) {
    assertMeritCredentials(credentials.credentials);
    return;
  }

  throw new Error("Unsupported accounting provider.");
}

export function assertSmartAccountsCredentials(
  credentials: SmartAccountsCredentials,
): SmartAccountsCredentials {
  if (!credentials.apiKey || !credentials.secretKey) {
    throw new Error("SmartAccounts API key and secret key are required.");
  }

  return credentials;
}

export function assertMeritCredentials(
  credentials: MeritCredentials,
): MeritCredentials {
  if (!credentials.apiId || !credentials.apiKey) {
    throw new Error("Merit API ID and API key are required.");
  }

  return credentials;
}

export function getProviderAdapter(credentials: AccountingCredentials) {
  return accountingProviders[credentials.provider];
}
