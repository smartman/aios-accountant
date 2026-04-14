export interface Transaction {
  date: Date;
  amount: number;
  description: string;
  reference?: string;
  source: "LHV" | "SmartAccounts";
  originalRow: Record<string, unknown>;
}

export interface ReconciliationResult {
  lhvTotal: number;
  smartAccountsTotal: number;
  balanceDifference: number;
  missingInSmartAccounts: Transaction[];
  missingInLHV: Transaction[];
  matchedCount: number;
}
