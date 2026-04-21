"use client";

import { ReactNode, useState } from "react";
import type { SavedConnectionSummary } from "@/lib/accounting-provider-types";
import ConnectionSettings from "./ConnectionSettings";
import InvoiceUpload from "./InvoiceUpload";
import {
  createInitialDashboardWorkspaceState,
  DashboardTab,
  isProviderConfigurationVisible,
  revealProviderConfiguration,
} from "./workspace-state";

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "btn btn-primary" : "btn btn-secondary"}
      onClick={onClick}
      style={{ minWidth: "180px" }}
    >
      {children}
    </button>
  );
}

export default function DashboardWorkspace({
  currentConnection,
}: {
  currentConnection: SavedConnectionSummary | null;
}) {
  const hasConnection = currentConnection !== null;
  const [workspaceState, setWorkspaceState] = useState(() =>
    createInitialDashboardWorkspaceState(hasConnection),
  );

  const providerTabAccess = hasConnection
    ? workspaceState.providerTabAccess === "missing-connection"
      ? null
      : workspaceState.providerTabAccess
    : "missing-connection";
  const activeTab =
    !hasConnection ||
    (workspaceState.activeTab === "provider" && providerTabAccess !== null)
      ? "provider"
      : "import";

  const providerConfigurationVisible = isProviderConfigurationVisible(
    hasConnection,
    providerTabAccess,
  );

  function handleSelectTab(tab: DashboardTab) {
    setWorkspaceState((previousState) => ({
      ...previousState,
      activeTab: tab,
    }));
  }

  function handleRequestProviderChange() {
    setWorkspaceState(revealProviderConfiguration());
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        <TabButton
          active={activeTab === "import"}
          onClick={() => handleSelectTab("import")}
        >
          Import invoices
        </TabButton>

        {providerConfigurationVisible ? (
          <TabButton
            active={activeTab === "provider"}
            onClick={() => handleSelectTab("provider")}
          >
            Accounting provider
          </TabButton>
        ) : null}
      </div>

      {activeTab === "provider" ? (
        <ConnectionSettings currentConnection={currentConnection} />
      ) : (
        <InvoiceUpload
          canImport={hasConnection}
          activeProvider={currentConnection?.provider ?? null}
          onRequestProviderChange={
            hasConnection ? handleRequestProviderChange : undefined
          }
        />
      )}
    </div>
  );
}
