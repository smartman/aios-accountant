"use client";

import type {
  WorkspaceMenuAction,
  WorkspaceMenuActionId,
} from "./workspace-menu";

export default function DashboardWorkspaceMenu({
  actions,
  onSelectAction,
}: {
  actions: WorkspaceMenuAction[];
  onSelectAction: (actionId: WorkspaceMenuActionId) => void;
}) {
  return (
    <nav
      aria-label="Workspace sections"
      className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-950"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-current={action.current ? "page" : undefined}
          className={`inline-flex min-h-[44px] items-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
            action.disabled
              ? "cursor-not-allowed text-slate-400 dark:text-slate-600"
              : action.current
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
          }`}
          disabled={action.disabled}
          onClick={() => {
            if (action.disabled) {
              return;
            }

            onSelectAction(action.id);
          }}
        >
          {action.label}
        </button>
      ))}
    </nav>
  );
}
