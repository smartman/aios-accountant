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
      <header className="sticky top-0 z-10 flex flex-col items-stretch gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between sm:px-6 sm:py-4 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-[0.95rem] font-semibold uppercase tracking-[0.14em] opacity-72 sm:text-base sm:tracking-[0.18em]">
          AI Accountant
        </p>

        <div className="flex min-w-0 items-start justify-between gap-3 min-[380px]:w-auto min-[380px]:items-center">
          <span className="min-w-0 flex-1 break-all text-xs leading-5 text-slate-500 sm:text-sm dark:text-slate-400">
            {user.email}
          </span>

          <form action={handleSignOut}>
            <button
              type="submit"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-3 py-5 sm:px-6 sm:py-8">
        <DashboardWorkspace
          currentConnection={savedConnection?.summary ?? null}
        />
      </main>
    </div>
  );
}
