import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "../prisma";
import { assertAccountingProvider } from "../accounting-providers";
import type { SavedConnectionSummary } from "../accounting-provider-types";
import {
  createDefaultCompanyConfiguration,
  normalizeCompanyConfiguration,
} from "./configuration";
import type {
  AuthenticatedCompanyUser,
  CompanyConfiguration,
  CompanySummary,
  SupportedCompanyCountry,
} from "./types";

const companyInclude = {
  accountingConnection: true,
  memberships: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
  invitations: {
    where: {
      acceptedAt: null,
    },
    orderBy: {
      createdAt: "asc" as const,
    },
  },
};

type CompanyRecord = Prisma.CompanyGetPayload<{
  include: typeof companyInclude;
}>;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function assertSupportedCountry(value: string): SupportedCompanyCountry {
  if (value === "EE") {
    return value;
  }

  throw new Error("Only Estonia is supported in this version.");
}

function sanitizeConnectionSummary(
  value: unknown,
): SavedConnectionSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const summary = value as SavedConnectionSummary;
  const provider = assertAccountingProvider(summary.provider);
  return {
    provider,
    label: summary.label,
    detail: summary.detail,
    verifiedAt: summary.verifiedAt,
    ...(typeof summary.publicId === "string"
      ? { publicId: summary.publicId }
      : {}),
    ...(typeof summary.secretMasked === "string"
      ? { secretMasked: summary.secretMasked }
      : {}),
  };
}

function mapCompany(record: CompanyRecord): CompanySummary {
  const provider = assertAccountingProvider(record.accountingProvider);
  const countryCode = assertSupportedCountry(record.countryCode);

  return {
    id: record.id,
    name: record.name,
    countryCode,
    accountingProvider: provider,
    configuration: normalizeCompanyConfiguration(record.configuration),
    connectionSummary: sanitizeConnectionSummary(
      record.accountingConnection?.credentialSummary,
    ),
    members: record.memberships.map((membership) => ({
      id: membership.id,
      workosUserId: membership.workosUserId,
      email: membership.email,
    })),
    invitations: record.invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      invitedByWorkosUserId: invitation.invitedByWorkosUserId,
    })),
  };
}

async function acceptPendingInvitations(user: AuthenticatedCompanyUser) {
  const email = normalizeEmail(user.email);
  if (!email) {
    return;
  }

  const prisma = getPrismaClient();
  const invitations = await prisma.companyInvitation.findMany({
    where: {
      email,
      acceptedAt: null,
    },
  });

  for (const invitation of invitations) {
    await prisma.companyMembership.upsert({
      where: {
        companyId_workosUserId: {
          companyId: invitation.companyId,
          workosUserId: user.id,
        },
      },
      create: {
        companyId: invitation.companyId,
        workosUserId: user.id,
        email,
      },
      update: {
        email,
      },
    });
    await prisma.companyInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        acceptedAt: new Date(),
      },
    });
  }
}

export async function listCompaniesForUser(
  user: AuthenticatedCompanyUser,
): Promise<CompanySummary[]> {
  await acceptPendingInvitations(user);

  const records = await getPrismaClient().company.findMany({
    where: {
      memberships: {
        some: {
          workosUserId: user.id,
        },
      },
    },
    include: companyInclude,
    orderBy: {
      createdAt: "asc",
    },
  });

  return records.map(mapCompany);
}

export async function getCompanyForUser(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
}): Promise<CompanySummary | null> {
  await acceptPendingInvitations(params.user);

  const record = await getPrismaClient().company.findFirst({
    where: {
      id: params.companyId,
      memberships: {
        some: {
          workosUserId: params.user.id,
        },
      },
    },
    include: companyInclude,
  });

  return record ? mapCompany(record) : null;
}

export async function requireCompanyForUser(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
}): Promise<CompanySummary> {
  const company = await getCompanyForUser(params);
  if (!company) {
    throw new Error("Company access was not found.");
  }

  return company;
}

export async function createCompanyForUser(params: {
  user: AuthenticatedCompanyUser;
  name: string;
  countryCode: string;
  accountingProvider: string;
}): Promise<CompanySummary> {
  const email = normalizeEmail(params.user.email);
  const countryCode = assertSupportedCountry(params.countryCode);
  const provider = assertAccountingProvider(params.accountingProvider);
  const name = params.name.trim();

  if (!name) {
    throw new Error("Company name is required.");
  }

  if (!email) {
    throw new Error("Your signed-in user must have an email address.");
  }

  const record = await getPrismaClient().company.create({
    data: {
      name,
      countryCode,
      accountingProvider: provider,
      configuration:
        createDefaultCompanyConfiguration() as unknown as Prisma.InputJsonValue,
      memberships: {
        create: {
          workosUserId: params.user.id,
          email,
        },
      },
    },
    include: companyInclude,
  });

  return mapCompany(record);
}

export async function updateCompanyProfile(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
  name: string;
  countryCode: string;
  accountingProvider: string;
}): Promise<CompanySummary> {
  const current = await requireCompanyForUser(params);
  const provider = assertAccountingProvider(params.accountingProvider);
  const countryCode = assertSupportedCountry(params.countryCode);
  const name = params.name.trim();

  if (!name) {
    throw new Error("Company name is required.");
  }

  const providerChanged = current.accountingProvider !== provider;
  if (providerChanged) {
    await getPrismaClient().companyAccountingConnection.deleteMany({
      where: {
        companyId: params.companyId,
      },
    });
  }

  const record = await getPrismaClient().company.update({
    where: {
      id: params.companyId,
    },
    data: {
      name,
      countryCode,
      accountingProvider: provider,
    },
    include: companyInclude,
  });

  return mapCompany(record);
}

export async function updateCompanyConfiguration(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
  configuration: CompanyConfiguration;
}): Promise<CompanySummary> {
  await requireCompanyForUser(params);

  const record = await getPrismaClient().company.update({
    where: {
      id: params.companyId,
    },
    data: {
      configuration: params.configuration as unknown as Prisma.InputJsonValue,
    },
    include: companyInclude,
  });

  return mapCompany(record);
}

export async function updateCompanyAccountingProvider(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
  accountingProvider: string;
}): Promise<CompanySummary> {
  const current = await requireCompanyForUser(params);
  const provider = assertAccountingProvider(params.accountingProvider);

  if (current.accountingProvider === provider) {
    return current;
  }

  await getPrismaClient().companyAccountingConnection.deleteMany({
    where: {
      companyId: params.companyId,
    },
  });

  const record = await getPrismaClient().company.update({
    where: {
      id: params.companyId,
    },
    data: {
      accountingProvider: provider,
    },
    include: companyInclude,
  });

  return mapCompany(record);
}

export async function inviteCompanyUser(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
  email: string;
}): Promise<void> {
  await requireCompanyForUser(params);
  const email = normalizeEmail(params.email);
  if (!email) {
    throw new Error("User email is required.");
  }

  const existingMember = await getPrismaClient().companyMembership.findFirst({
    where: {
      companyId: params.companyId,
      email,
    },
  });
  if (existingMember) {
    throw new Error("That email already has access to this company.");
  }

  await getPrismaClient().companyInvitation.upsert({
    where: {
      companyId_email: {
        companyId: params.companyId,
        email,
      },
    },
    create: {
      companyId: params.companyId,
      email,
      invitedByWorkosUserId: params.user.id,
    },
    update: {
      acceptedAt: null,
      invitedByWorkosUserId: params.user.id,
    },
  });
}

export async function removeCompanyInvitation(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
  invitationId: string;
}): Promise<void> {
  await requireCompanyForUser(params);

  await getPrismaClient().companyInvitation.deleteMany({
    where: {
      id: params.invitationId,
      companyId: params.companyId,
      acceptedAt: null,
    },
  });
}

export async function removeCompanyMember(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
  membershipId: string;
}): Promise<void> {
  await requireCompanyForUser(params);
  await getPrismaClient().$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT id FROM "Company" WHERE id = ${params.companyId} FOR UPDATE
    `;
    const memberCount = await transaction.companyMembership.count({
      where: {
        companyId: params.companyId,
      },
    });
    if (memberCount <= 1) {
      throw new Error("A company must keep at least one active user.");
    }

    const membership = await transaction.companyMembership.findFirst({
      where: {
        id: params.membershipId,
        companyId: params.companyId,
      },
    });
    if (!membership) {
      throw new Error("Company user was not found.");
    }
    if (membership.workosUserId === params.user.id) {
      throw new Error("You cannot remove your own company access.");
    }

    const deleted = await transaction.companyMembership.deleteMany({
      where: {
        id: params.membershipId,
        companyId: params.companyId,
      },
    });
    if (deleted.count === 0) {
      throw new Error("Company user was not found.");
    }
  });
}

export async function deleteCompanyForUser(params: {
  companyId: string;
  user: AuthenticatedCompanyUser;
}): Promise<void> {
  await requireCompanyForUser(params);

  await getPrismaClient().company.delete({
    where: {
      id: params.companyId,
    },
  });
}
