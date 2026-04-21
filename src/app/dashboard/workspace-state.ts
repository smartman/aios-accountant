export type DashboardTab = "import" | "provider";

export type ProviderTabAccess = "missing-connection" | "change-request" | null;

export interface DashboardWorkspaceState {
  activeTab: DashboardTab;
  providerTabAccess: ProviderTabAccess;
}

export function createInitialDashboardWorkspaceState(
  hasConnection: boolean,
): DashboardWorkspaceState {
  return hasConnection
    ? {
        activeTab: "import",
        providerTabAccess: null,
      }
    : {
        activeTab: "provider",
        providerTabAccess: "missing-connection",
      };
}

export function reconcileDashboardWorkspaceState(
  state: DashboardWorkspaceState,
  hasConnection: boolean,
): DashboardWorkspaceState {
  if (!hasConnection) {
    return {
      activeTab: "provider",
      providerTabAccess: "missing-connection",
    };
  }

  if (state.providerTabAccess === "missing-connection") {
    return {
      activeTab: "import",
      providerTabAccess: null,
    };
  }

  return state;
}

export function revealProviderConfiguration(): DashboardWorkspaceState {
  return {
    activeTab: "provider",
    providerTabAccess: "change-request",
  };
}

export function isProviderConfigurationVisible(
  hasConnection: boolean,
  providerTabAccess: ProviderTabAccess,
): boolean {
  return !hasConnection || providerTabAccess !== null;
}
