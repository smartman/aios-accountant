import { Prisma } from "@/generated/prisma/client";
import {
  AccountingCredentials,
  AccountingProvider,
  SavedConnectionSummary,
} from "./accounting-provider-types";
import { decryptJson, encryptJson } from "./connection-crypto";
import { getPrismaClient } from "./prisma";

export interface StoredAccountingConnection {
  workosUserId: string;
  provider: AccountingProvider;
  credentials: AccountingCredentials;
  summary: SavedConnectionSummary;
  verifiedAt: Date;
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
  workosUserId: string,
): Promise<StoredAccountingConnection | null> {
  const record = await getPrismaClient().userAccountingConnection.findUnique({
    where: {
      workosUserId,
    },
  });

  if (!record) {
    return null;
  }

  const provider = assertAccountingProvider(record.provider);
  const credentials = assertCredentialProvider(
    provider,
    decryptJson<AccountingCredentials>(record.encryptedCredentials),
  );

  return {
    workosUserId: record.workosUserId,
    provider,
    credentials,
    summary: sanitizeSavedConnectionSummary(
      record.credentialSummary as unknown as SavedConnectionSummary,
    ),
    verifiedAt: record.verifiedAt,
  };
}

export async function upsertAccountingConnection(params: {
  workosUserId: string;
  credentials: AccountingCredentials;
  summary: SavedConnectionSummary;
  verifiedAt?: Date;
}): Promise<StoredAccountingConnection> {
  const verifiedAt = params.verifiedAt ?? new Date();
  const summary = sanitizeSavedConnectionSummary(params.summary);
  const record = await getPrismaClient().userAccountingConnection.upsert({
    where: {
      workosUserId: params.workosUserId,
    },
    create: {
      workosUserId: params.workosUserId,
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
    workosUserId: record.workosUserId,
    provider: assertAccountingProvider(record.provider),
    credentials: params.credentials,
    summary,
    verifiedAt: record.verifiedAt,
  };
}
