DROP TABLE IF EXISTS "UserAccountingConnection";

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "emtakCode" TEXT NOT NULL,
    "emtakLabel" TEXT NOT NULL,
    "accountingProvider" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workosUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyInvitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedByWorkosUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyAccountingConnection" (
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "credentialSummary" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAccountingConnection_pkey" PRIMARY KEY ("companyId")
);

CREATE INDEX "Company_countryCode_idx" ON "Company"("countryCode");

CREATE UNIQUE INDEX "CompanyMembership_companyId_workosUserId_key"
    ON "CompanyMembership"("companyId", "workosUserId");
CREATE UNIQUE INDEX "CompanyMembership_companyId_email_key"
    ON "CompanyMembership"("companyId", "email");
CREATE INDEX "CompanyMembership_workosUserId_idx"
    ON "CompanyMembership"("workosUserId");
CREATE INDEX "CompanyMembership_email_idx" ON "CompanyMembership"("email");

CREATE UNIQUE INDEX "CompanyInvitation_companyId_email_key"
    ON "CompanyInvitation"("companyId", "email");
CREATE INDEX "CompanyInvitation_email_idx" ON "CompanyInvitation"("email");

ALTER TABLE "CompanyMembership"
    ADD CONSTRAINT "CompanyMembership_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyInvitation"
    ADD CONSTRAINT "CompanyInvitation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyAccountingConnection"
    ADD CONSTRAINT "CompanyAccountingConnection_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
