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
    <div
      className="animate-fade-in"
      style={{
        maxWidth: "1180px",
        margin: "0 auto",
        padding: "2rem 1.25rem 4rem",
      }}
    >
      <header
        style={{
          padding: "2rem",
          borderRadius: "28px",
          marginBottom: "2rem",
          background:
            "radial-gradient(circle at top left, rgba(237, 137, 54, 0.22), transparent 35%), linear-gradient(135deg, #0f172a, #111827 55%, #1f2937)",
          color: "#f8fafc",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 25px 60px rgba(15, 23, 42, 0.35)",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: "0.75rem",
            opacity: 0.72,
            marginBottom: "0.75rem",
          }}
        >
          AI Accountant
        </p>
        <h1
          style={{
            fontSize: "clamp(2.2rem, 6vw, 4.5rem)",
            lineHeight: 1,
            fontWeight: 800,
            marginBottom: "1rem",
          }}
        >
          Increase accountant productivity by 10–100×.
        </h1>
        <p
          style={{
            maxWidth: "760px",
            fontSize: "1.05rem",
            color: "rgba(248,250,252,0.78)",
            marginBottom: "2rem",
          }}
        >
          AI Accountant handles all accountant tasks under human supervision —
          from invoice extraction and classification to posting and payment
          reconciliation.
        </p>

        {hasAuthError && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.875rem 1.25rem",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid #ef4444",
              color: "#fca5a5",
              fontSize: "0.95rem",
            }}
          >
            Sign-in failed. Please try again.
          </div>
        )}

        <a
          href="/api/auth/signin"
          className="btn btn-primary"
          style={{
            display: "inline-flex",
            fontSize: "1.05rem",
            padding: "0.875rem 2rem",
          }}
        >
          Get started — sign in
        </a>
      </header>
    </div>
  );
}
