-- CreateTable
CREATE TABLE "UserAccountingConnection" (
    "workosUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "credentialSummary" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccountingConnection_pkey" PRIMARY KEY ("workosUserId")
);
