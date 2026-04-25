import type {
  AccountingProvider,
  SavedConnectionSummary,
} from "../accounting-provider-types";

export type SupportedCompanyCountry = "EE";

export interface EmtakRecord {
  code: string;
  parent: string | null;
  label: string;
}

export interface CompanyProjectRule {
  id: string;
  name: string;
  code: string;
  invoiceKeywords: string;
  relatedVendors: string;
  driveFolderHints: string;
  providerDimensionCode: string;
}

export interface CompanyConfiguration {
  fixedAssetThreshold: number;
  costPreference: string;
  carVatPolicy: "mixed-use" | "business-only" | "none";
  representationRules: string;
  uncertainExpensePolicy: string;
  inventory: {
    usesMeritInventory: boolean;
    inventoryKeywords: string;
    newArticlePolicy: "auto" | "confirm";
    defaultUnit: string;
  };
  vendorExceptions: {
    retail: string;
    ecommerce: string;
  };
  projects: CompanyProjectRule[];
}

export interface CompanyMemberSummary {
  id: string;
  workosUserId: string;
  email: string;
}

export interface CompanyInvitationSummary {
  id: string;
  email: string;
  invitedByWorkosUserId: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  countryCode: SupportedCompanyCountry;
  emtakCode: string;
  emtakLabel: string;
  accountingProvider: AccountingProvider;
  configuration: CompanyConfiguration;
  connectionSummary: SavedConnectionSummary | null;
  members: CompanyMemberSummary[];
  invitations: CompanyInvitationSummary[];
}

export interface AuthenticatedCompanyUser {
  id: string;
  email?: string | null;
}
