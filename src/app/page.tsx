import { redirect } from "next/navigation";
import { getUser } from "@/lib/workos";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Check session — withAuth() throws when the route isn't covered by the proxy matcher,
  // which means the user is unauthenticated. Treat any error as "no session".
  try {
    const { user } = await getUser();
    if (user) {
      redirect("/dashboard");
    }
  } catch {
    // Not covered by proxy matcher → unauthenticated, render landing page
  }

  const { error } = await searchParams;
  const hasAuthError = error === "auth_failed";

  return (
    <div className="mx-auto max-w-[73.75rem] px-5 pb-16 pt-8 animate-fade-in">
      <header className="mb-8 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(237,137,54,0.22),_transparent_35%),_linear-gradient(135deg,_#0f172a,_#111827_55%,_#1f2937)] p-8 text-slate-50 shadow-[0_25px_60px_rgba(15,23,42,0.35)]">
        <p className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.18em] opacity-72">
          AI Accountant
        </p>
        <h1 className="mb-4 text-[clamp(2.2rem,6vw,4.5rem)] font-extrabold leading-none">
          Increase accountant productivity by 10–100×.
        </h1>
        <p className="max-w-[760px] text-[1.05rem] text-[rgba(248,250,252,0.78)]">
          AI Accountant handles all accountant tasks under human supervision —
          from invoice extraction and classification to posting and payment
          reconciliation.
        </p>

        {hasAuthError ? (
          <div className="mb-6 rounded-lg border border-red-500 bg-red-500/20 px-5 py-[0.875rem] text-sm text-red-200">
            Sign-in failed. Please try again.
          </div>
        ) : null}

        <a
          href="/api/auth/signin"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-8 py-[0.875rem] text-base font-semibold text-white shadow-[0_4px_6px_-1px_rgba(99,102,241,0.2),_0_2px_4px_-1px_rgba(99,102,241,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_10px_15px_-3px_rgba(99,102,241,0.3),_0_4px_6px_-2px_rgba(99,102,241,0.15)]"
        >
          Get started — sign in
        </a>
      </header>
    </div>
  );
}
