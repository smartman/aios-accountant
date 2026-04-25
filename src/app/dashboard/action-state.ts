export interface SaveConnectionState {
  status: "idle" | "success" | "error";
  message?: string;
  provider?: "smartaccounts" | "merit";
}

export interface ClearCacheState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface CompanyActionState {
  status: "idle" | "success" | "error";
  message?: string;
  companyId?: string;
}

export const initialSaveConnectionState: SaveConnectionState = {
  status: "idle",
};

export const initialClearCacheState: ClearCacheState = {
  status: "idle",
};

export const initialCompanyActionState: CompanyActionState = {
  status: "idle",
};
