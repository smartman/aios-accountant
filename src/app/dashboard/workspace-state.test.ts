import { describe, expect, it } from "vitest";
import {
  createInitialDashboardWorkspaceState,
  isProviderConfigurationVisible,
  reconcileDashboardWorkspaceState,
  revealProviderConfiguration,
} from "./workspace-state";

describe("workspace-state", () => {
  it("starts on the provider tab when no connection exists", () => {
    const state = createInitialDashboardWorkspaceState(false);

    expect(state).toEqual({
      activeTab: "provider",
      providerTabAccess: "missing-connection",
    });
    expect(isProviderConfigurationVisible(false, state.providerTabAccess)).toBe(
      true,
    );
  });

  it("starts on the import tab when a connection exists", () => {
    const state = createInitialDashboardWorkspaceState(true);

    expect(state).toEqual({
      activeTab: "import",
      providerTabAccess: null,
    });
    expect(isProviderConfigurationVisible(true, state.providerTabAccess)).toBe(
      false,
    );
  });

  it("returns to import after the first provider save", () => {
    const state = reconcileDashboardWorkspaceState(
      {
        activeTab: "provider",
        providerTabAccess: "missing-connection",
      },
      true,
    );

    expect(state).toEqual({
      activeTab: "import",
      providerTabAccess: null,
    });
  });

  it("forces the provider tab back into view when no connection remains", () => {
    const state = reconcileDashboardWorkspaceState(
      {
        activeTab: "import",
        providerTabAccess: null,
      },
      false,
    );

    expect(state).toEqual({
      activeTab: "provider",
      providerTabAccess: "missing-connection",
    });
  });

  it("keeps provider configuration available after an explicit change request", () => {
    const state = revealProviderConfiguration();

    expect(state).toEqual({
      activeTab: "provider",
      providerTabAccess: "change-request",
    });
    expect(isProviderConfigurationVisible(true, state.providerTabAccess)).toBe(
      true,
    );
    expect(reconcileDashboardWorkspaceState(state, true)).toEqual(state);
  });
});
