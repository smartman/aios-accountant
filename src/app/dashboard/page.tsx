import { redirect } from "next/navigation";
import { getUser, signOut } from "@/lib/workos";
import DashboardWorkspace from "./DashboardWorkspace";
import { getStoredAccountingConnection } from "@/lib/user-accounting-connections";

export default async function DashboardPage() {
  const { user } = await getUser();

  if (!user) {
    redirect("/");
  }

  const savedConnection = user.id
    ? await getStoredAccountingConnection(user.id)
    : null;

  async function handleSignOut() {
    "use server";
    await signOut();
    redirect("/");
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-950">
        <p className="font-semibold uppercase tracking-[0.18em] opacity-72">
          AI Accountant
        </p>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {user.email}
          </span>

          <form action={handleSignOut}>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-60 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6">
        <DashboardWorkspace
          currentConnection={savedConnection?.summary ?? null}
        />
      </main>
    </div>
  );
}
