"use client";

import { useState } from "react";
import type { CompanySummary } from "@/lib/companies/types";
import CompanySettings from "./CompanySettings";
import CompanySetupWizard from "./CompanySetupWizard";
import DashboardWorkspaceMenu from "./DashboardWorkspaceMenu";
import InvoiceUpload from "./InvoiceUpload";
import {
  DashboardTab,
  createInitialDashboardWorkspaceState,
} from "./workspace-state";
import {
  createWorkspaceMenuActions,
  getWorkspaceSectionLabel,
  getWorkspaceStatusLabel,
} from "./workspace-menu";

function CompanySwitcher({
  activeCompany,
  companies,
  onCreateCompany,
  onSelectCompany,
}: {
  activeCompany: CompanySummary;
  companies: CompanySummary[];
  onCreateCompany: () => void;
  onSelectCompany: (companyId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex min-w-[260px] flex-col gap-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Company
        </span>
        <select
          className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          value={activeCompany.id}
          onChange={(event) => {
            if (event.target.value === "__new_company__") {
              onCreateCompany();
              return;
            }

            onSelectCompany(event.target.value);
          }}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
          <option value="__new_company__">+ New company</option>
        </select>
      </label>
    </div>
  );
}

/* v8 ignore start -- jsdom cannot perform full document navigation. */
function navigateToCompanyDashboard(companyId: string) {
  window.location.href = `/dashboard?companyId=${companyId}`;
}
/* v8 ignore stop */

export default function DashboardWorkspace({
  activeCompany,
  companies,
  navigateToCompany = navigateToCompanyDashboard,
  userEmail,
}: {
  activeCompany: CompanySummary | null;
  companies: CompanySummary[];
  navigateToCompany?: (companyId: string) => void;
  userEmail: string;
}) {
  const [workspaceState, setWorkspaceState] = useState(() =>
    createInitialDashboardWorkspaceState(
      Boolean(activeCompany?.connectionSummary),
    ),
  );
  const [creatingCompany, setCreatingCompany] = useState(false);

  if (!activeCompany) {
    return <CompanySetupWizard />;
  }

  const hasConnection = activeCompany.connectionSummary !== null;
  const activeTab =
    workspaceState.activeTab === "import" && hasConnection
      ? "import"
      : workspaceState.activeTab === "settings"
        ? "settings"
        : hasConnection
          ? "import"
          : "settings";
  const currentStatusLabel = getWorkspaceStatusLabel(
    hasConnection,
    activeCompany.accountingProvider,
    activeCompany.name,
  );
  const menuActions = createWorkspaceMenuActions({
    activeProvider: activeCompany.accountingProvider,
    activeTab,
    hasConnection,
  });

  function handleSelectTab(tab: DashboardTab) {
    setCreatingCompany(false);
    setWorkspaceState((previousState) => ({
      ...previousState,
      activeTab: tab,
    }));
  }

  function handleCreateCompany() {
    setWorkspaceState((previousState) => ({
      ...previousState,
      activeTab: "settings",
    }));
    setCreatingCompany(true);
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4 sm:pb-5 dark:border-slate-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-[clamp(1.35rem,7vw,2.4rem)] font-semibold leading-none text-slate-950 dark:text-slate-50">
              {getWorkspaceSectionLabel(activeTab)}
            </h2>
            {activeTab === "settings" ? null : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {currentStatusLabel}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <CompanySwitcher
              activeCompany={activeCompany}
              companies={companies}
              onCreateCompany={handleCreateCompany}
              onSelectCompany={navigateToCompany}
            />
            <DashboardWorkspaceMenu
              actions={menuActions}
              onSelectAction={handleSelectTab}
            />
          </div>
        </div>
      </header>

      {creatingCompany ? (
        <CompanySetupWizard
          mode="additional"
          onCancel={() => setCreatingCompany(false)}
        />
      ) : activeTab === "settings" ? (
        <CompanySettings company={activeCompany} userEmail={userEmail} />
      ) : (
        <InvoiceUpload
          canImport={hasConnection}
          activeProvider={activeCompany.accountingProvider}
          companyId={activeCompany.id}
        />
      )}
    </div>
  );
}
