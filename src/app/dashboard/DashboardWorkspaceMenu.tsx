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
      className="flex w-full flex-nowrap gap-2 overflow-x-auto min-[440px]:w-auto min-[440px]:flex-wrap"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-current={action.current ? "page" : undefined}
          className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
            action.disabled
              ? "cursor-not-allowed border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
              : action.current
                ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
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
