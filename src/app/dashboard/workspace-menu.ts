import { getProviderLabel } from "@/lib/accounting-provider-types";
import type { DashboardTab } from "./workspace-state";

export type WorkspaceMenuActionId = "import" | "provider";

export interface WorkspaceMenuAction {
  current: boolean;
  disabled: boolean;
  id: WorkspaceMenuActionId;
  label: string;
}

export function getWorkspaceSectionLabel(activeTab: DashboardTab): string {
  return activeTab === "provider" ? "Accounting provider" : "Import invoices";
}

export function getWorkspaceStatusLabel(
  hasConnection: boolean,
  activeProvider: "smartaccounts" | "merit" | null,
): string {
  if (!hasConnection || activeProvider === null) {
    return "Set up a provider to start importing invoices.";
  }

  return `${getProviderLabel(activeProvider)} is connected.`;
}

export function createWorkspaceMenuActions(params: {
  activeProvider: "smartaccounts" | "merit" | null;
  activeTab: DashboardTab;
  hasConnection: boolean;
}): WorkspaceMenuAction[] {
  return [
    {
      current: params.activeTab === "import",
      disabled: !params.hasConnection,
      id: "import",
      label: "Import invoices",
    },
    {
      current: params.activeTab === "provider",
      disabled: false,
      id: "provider",
      label: params.hasConnection ? "Accounting provider" : "Set up provider",
    },
  ];
}
