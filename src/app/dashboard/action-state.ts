export interface SaveConnectionState {
  status: "idle" | "success" | "error";
  message?: string;
  provider?: "smartaccounts" | "merit";
}

export interface ClearCacheState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialSaveConnectionState: SaveConnectionState = {
  status: "idle",
};

export const initialClearCacheState: ClearCacheState = {
  status: "idle",
};
