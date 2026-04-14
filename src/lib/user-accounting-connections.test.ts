import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AccountingCredentials,
  type SavedConnectionSummary,
} from "./accounting-provider-types";
import { encryptJson } from "./connection-crypto";

const prismaMock = {
  userAccountingConnection: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock("./prisma", () => ({
  getPrismaClient: () => prismaMock,
}));

type StoredRecord = {
  workosUserId: string;
  provider: string;
  encryptedCredentials: string;
  credentialSummary: SavedConnectionSummary & Record<string, unknown>;
  verifiedAt: Date;
};

let storedRecord: StoredRecord | null = null;

function buildCredentials(
  provider: "smartaccounts" | "merit",
): AccountingCredentials {
  if (provider === "smartaccounts") {
    return {
      provider,
      credentials: {
        apiKey: "smart-api",
        secretKey: "smart-secret",
      },
    };
  }

  return {
    provider,
    credentials: {
      apiId: "merit-id",
      apiKey: "merit-key",
    },
  };
}

function buildSummary(
  provider: "smartaccounts" | "merit",
): SavedConnectionSummary {
  return {
    provider,
    label: provider === "smartaccounts" ? "SmartAccounts" : "Merit",
    detail: `${provider} verified successfully.`,
    verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
    publicId: provider === "smartaccounts" ? "smart-api" : "merit-id",
    secretMasked: provider === "smartaccounts" ? "*******ret" : "*****key",
  };
}

beforeEach(() => {
  storedRecord = null;
  prismaMock.userAccountingConnection.findUnique.mockImplementation(
    async ({ where }) => {
      return storedRecord?.workosUserId === where.workosUserId
        ? storedRecord
        : null;
    },
  );
  prismaMock.userAccountingConnection.upsert.mockImplementation(
    async ({ where, create, update }) => {
      const nextRecord = storedRecord ? { ...storedRecord, ...update } : create;
      storedRecord = {
        workosUserId: where.workosUserId ?? nextRecord.workosUserId,
        provider: nextRecord.provider,
        encryptedCredentials: nextRecord.encryptedCredentials,
        credentialSummary: nextRecord.credentialSummary,
        verifiedAt: nextRecord.verifiedAt,
      };
      return storedRecord;
    },
  );
});

describe("user-accounting-connections", () => {
  it("returns null when no accounting connection is stored", async () => {
    const { getStoredAccountingConnection } =
      await import("./user-accounting-connections");

    await expect(
      getStoredAccountingConnection("missing-user"),
    ).resolves.toBeNull();
  });

  it("stores sanitized summaries and decrypts credentials on read", async () => {
    const { getStoredAccountingConnection, upsertAccountingConnection } =
      await import("./user-accounting-connections");

    const summaryWithSecret = {
      ...buildSummary("smartaccounts"),
      secretKey: "do-not-store",
    } as SavedConnectionSummary & Record<string, unknown>;

    const saved = await upsertAccountingConnection({
      workosUserId: "user-1",
      credentials: buildCredentials("smartaccounts"),
      summary: summaryWithSecret,
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    });
    const hydrated = await getStoredAccountingConnection("user-1");

    expect(saved.provider).toBe("smartaccounts");
    expect(saved.summary).toEqual(buildSummary("smartaccounts"));
    expect(storedRecord?.credentialSummary).toEqual(
      buildSummary("smartaccounts"),
    );
    expect(storedRecord?.encryptedCredentials).toMatch(/^v1:/);
    expect(hydrated).toEqual({
      workosUserId: "user-1",
      provider: "smartaccounts",
      credentials: buildCredentials("smartaccounts"),
      summary: buildSummary("smartaccounts"),
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    });
  });

  it("drops optional summary fields that are not strings and defaults verifiedAt on upsert", async () => {
    const { upsertAccountingConnection } =
      await import("./user-accounting-connections");

    const saved = await upsertAccountingConnection({
      workosUserId: "user-optional",
      credentials: buildCredentials("merit"),
      summary: {
        provider: "merit",
        label: "Merit",
        detail: "Verified",
        verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
        publicId: 123 as unknown as string,
        secretMasked: null as unknown as string,
      },
    });

    expect(saved.summary).toEqual({
      provider: "merit",
      label: "Merit",
      detail: "Verified",
      verifiedAt: new Date("2026-04-14T09:00:00.000Z").toISOString(),
    });
    expect(saved.verifiedAt).toBeInstanceOf(Date);
  });

  it("rejects unsupported stored providers", async () => {
    const { getStoredAccountingConnection } =
      await import("./user-accounting-connections");

    storedRecord = {
      workosUserId: "user-2",
      provider: "unsupported-provider",
      encryptedCredentials: encryptJson(buildCredentials("smartaccounts")),
      credentialSummary: buildSummary(
        "smartaccounts",
      ) as SavedConnectionSummary & Record<string, unknown>,
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    };

    await expect(getStoredAccountingConnection("user-2")).rejects.toThrow(
      "Unsupported accounting provider: unsupported-provider",
    );
  });

  it("rejects stored credentials that do not match the provider", async () => {
    const { getStoredAccountingConnection } =
      await import("./user-accounting-connections");

    storedRecord = {
      workosUserId: "user-3",
      provider: "smartaccounts",
      encryptedCredentials: encryptJson(buildCredentials("merit")),
      credentialSummary: buildSummary(
        "smartaccounts",
      ) as SavedConnectionSummary & Record<string, unknown>,
      verifiedAt: new Date("2026-04-14T09:00:00.000Z"),
    };

    await expect(getStoredAccountingConnection("user-3")).rejects.toThrow(
      "Stored credentials do not match the saved accounting provider.",
    );
  });
});
