export type DashboardTab = "import" | "settings";

export interface DashboardWorkspaceState {
  activeTab: DashboardTab;
}

export function createInitialDashboardWorkspaceState(
  hasConnection: boolean,
): DashboardWorkspaceState {
  return {
    activeTab: hasConnection ? "import" : "settings",
  };
}
