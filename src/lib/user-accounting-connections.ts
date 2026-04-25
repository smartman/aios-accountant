import { Prisma } from "@/generated/prisma/client";
import {
  AccountingCredentials,
  AccountingProvider,
  SavedConnectionSummary,
} from "./accounting-provider-types";
import { decryptJson, encryptJson } from "./connection-crypto";
import { getPrismaClient } from "./prisma";

export interface StoredAccountingConnection {
  companyId?: string;
  workosUserId?: string;
  provider: AccountingProvider;
  credentials: AccountingCredentials;
  summary: SavedConnectionSummary;
  verifiedAt: Date;
  companyContext?: string;
}

function sanitizeSavedConnectionSummary(
  summary: SavedConnectionSummary,
): SavedConnectionSummary {
  const sanitized: SavedConnectionSummary = {
    provider: summary.provider,
    label: summary.label,
    detail: summary.detail,
    verifiedAt: summary.verifiedAt,
  };

  if (typeof summary.publicId === "string") {
    sanitized.publicId = summary.publicId;
  }

  if (typeof summary.secretMasked === "string") {
    sanitized.secretMasked = summary.secretMasked;
  }

  return sanitized;
}

function assertAccountingProvider(value: string): AccountingProvider {
  if (value === "smartaccounts" || value === "merit") {
    return value;
  }

  throw new Error(`Unsupported accounting provider: ${value}`);
}

function assertCredentialProvider(
  provider: AccountingProvider,
  credentials: AccountingCredentials,
): AccountingCredentials {
  if (credentials.provider !== provider) {
    throw new Error(
      "Stored credentials do not match the saved accounting provider.",
    );
  }

  return credentials;
}

export async function getStoredAccountingConnection(
  companyId: string,
): Promise<StoredAccountingConnection | null> {
  const record = await getPrismaClient().companyAccountingConnection.findUnique(
    {
      where: {
        companyId,
      },
    },
  );

  if (!record) {
    return null;
  }

  const provider = assertAccountingProvider(record.provider);
  const credentials = assertCredentialProvider(
    provider,
    decryptJson<AccountingCredentials>(record.encryptedCredentials),
  );

  return {
    companyId: record.companyId,
    provider,
    credentials,
    summary: sanitizeSavedConnectionSummary(
      record.credentialSummary as unknown as SavedConnectionSummary,
    ),
    verifiedAt: record.verifiedAt,
  };
}

export async function upsertAccountingConnection(params: {
  companyId?: string;
  workosUserId?: string;
  credentials: AccountingCredentials;
  summary: SavedConnectionSummary;
  verifiedAt?: Date;
}): Promise<StoredAccountingConnection> {
  const companyId = params.companyId ?? params.workosUserId;
  if (!companyId) {
    throw new Error("Company id is required for accounting credentials.");
  }

  const verifiedAt = params.verifiedAt ?? new Date();
  const summary = sanitizeSavedConnectionSummary(params.summary);
  const record = await getPrismaClient().companyAccountingConnection.upsert({
    where: {
      companyId,
    },
    create: {
      companyId,
      provider: params.credentials.provider,
      encryptedCredentials: encryptJson(params.credentials),
      credentialSummary: summary as unknown as Prisma.InputJsonValue,
      verifiedAt,
    },
    update: {
      provider: params.credentials.provider,
      encryptedCredentials: encryptJson(params.credentials),
      credentialSummary: summary as unknown as Prisma.InputJsonValue,
      verifiedAt,
    },
  });

  return {
    companyId: record.companyId,
    provider: assertAccountingProvider(record.provider),
    credentials: params.credentials,
    summary,
    verifiedAt: record.verifiedAt,
  };
}

export async function deleteAccountingConnection(companyId: string) {
  await getPrismaClient().companyAccountingConnection.deleteMany({
    where: {
      companyId,
    },
  });
}
