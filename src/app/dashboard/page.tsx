import { redirect } from "next/navigation";
import { getUser, signOut } from "@/lib/workos";
import InvoiceUpload from "./InvoiceUpload";
import ConnectionSettings from "./ConnectionSettings";
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
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--background)",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: "0.75rem",
            fontWeight: 700,
            opacity: 0.72,
            margin: 0,
          }}
        >
          AI Accountant
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            {user.email}
          </span>

          <form action={handleSignOut}>
            <button
              type="submit"
              className="btn btn-secondary"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "2rem 1.25rem 4rem",
        }}
      >
        <ConnectionSettings
          currentConnection={savedConnection?.summary ?? null}
        />
        <InvoiceUpload
          canImport={Boolean(savedConnection)}
          activeProvider={savedConnection?.summary.provider ?? null}
        />
      </main>
    </div>
  );
}
