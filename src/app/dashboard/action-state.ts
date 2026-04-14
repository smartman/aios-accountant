export interface SaveConnectionState {
  status: "idle" | "success" | "error";
  message?: string;
  provider?: "smartaccounts" | "merit";
}

export const initialSaveConnectionState: SaveConnectionState = {
  status: "idle",
};
