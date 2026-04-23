"use client";

import { useState } from "react";
import type { SavedConnectionSummary } from "@/lib/accounting-provider-types";
import ConnectionSettings from "./ConnectionSettings";
import DashboardWorkspaceMenu from "./DashboardWorkspaceMenu";
import InvoiceUpload from "./InvoiceUpload";
import {
  createInitialDashboardWorkspaceState,
  DashboardTab,
  revealProviderConfiguration,
} from "./workspace-state";
import {
  createWorkspaceMenuActions,
  getWorkspaceSectionLabel,
  getWorkspaceStatusLabel,
} from "./workspace-menu";

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

  function handleSelectTab(tab: DashboardTab) {
    setWorkspaceState((previousState) => ({
      ...previousState,
      activeTab: tab,
    }));
  }

  function handleRequestProviderChange() {
    setWorkspaceState(revealProviderConfiguration());
  }

  const currentProvider = currentConnection?.provider ?? null;
  const currentSectionLabel = getWorkspaceSectionLabel(activeTab);
  const currentStatusLabel = getWorkspaceStatusLabel(
    hasConnection,
    currentProvider,
  );
  const menuActions = createWorkspaceMenuActions({
    activeProvider: currentProvider,
    activeTab,
    hasConnection,
  });

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4 sm:pb-5 dark:border-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
              Accounting
            </p>
            <h2 className="mt-2 text-[clamp(1.35rem,7vw,2.4rem)] font-semibold leading-none text-slate-950 sm:mt-3 dark:text-slate-50">
              {currentSectionLabel}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {currentStatusLabel}
            </p>
          </div>

          <DashboardWorkspaceMenu
            actions={menuActions}
            onSelectAction={(actionId) => {
              if (actionId === "provider") {
                handleRequestProviderChange();
                return;
              }

              handleSelectTab("import");
            }}
          />
        </div>
      </header>

      {activeTab === "provider" ? (
        <ConnectionSettings currentConnection={currentConnection} />
      ) : (
        <InvoiceUpload
          canImport={hasConnection}
          activeProvider={currentProvider}
        />
      )}
    </div>
  );
}
