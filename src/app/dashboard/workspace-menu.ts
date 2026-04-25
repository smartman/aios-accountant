import { getProviderLabel } from "@/lib/accounting-provider-types";
import type { DashboardTab } from "./workspace-state";

export type WorkspaceMenuActionId = DashboardTab;

export interface WorkspaceMenuAction {
  current: boolean;
  disabled: boolean;
  id: WorkspaceMenuActionId;
  label: string;
}

export function getWorkspaceSectionLabel(activeTab: DashboardTab): string {
  return activeTab === "settings" ? "Company settings" : "Import invoices";
}

export function getWorkspaceStatusLabel(
  hasConnection: boolean,
  activeProvider: "smartaccounts" | "merit" | null,
  companyName: string,
): string {
  if (!hasConnection || activeProvider === null) {
    return `${companyName}: verify credentials before importing invoices.`;
  }

  return `${companyName}: ${getProviderLabel(activeProvider)} is connected.`;
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
      current: params.activeTab === "settings",
      disabled: false,
      id: "settings",
      label: "Company settings",
    },
  ];
}
