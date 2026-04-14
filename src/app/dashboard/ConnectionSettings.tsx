"use client";

import { useActionState, useState } from "react";
import type { SavedConnectionSummary } from "@/lib/accounting-provider-types";
import { initialSaveConnectionState } from "./action-state";
import { saveAccountingConnection } from "./actions";

function formatVerifiedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatSavedValue(value: string | undefined, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function ConnectionSummaryCard({
  currentConnection,
}: {
  currentConnection: SavedConnectionSummary;
}) {
  return (
    <div
      style={{
        minWidth: "250px",
        padding: "1rem 1.25rem",
        borderRadius: "14px",
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>{currentConnection.label}</p>
      <div
        style={{
          display: "grid",
          gap: "0.4rem",
          marginTop: "0.7rem",
          fontSize: "0.9rem",
        }}
      >
        <div>
          <span style={{ color: "var(--text-muted)" }}>Accounting app: </span>
          <span>{currentConnection.label}</span>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Public ID: </span>
          <span>
            {formatSavedValue(
              currentConnection.publicId,
              currentConnection.detail,
            )}
          </span>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Secret: </span>
          <span>
            {formatSavedValue(currentConnection.secretMasked, "Hidden")}
          </span>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
          Verified {formatVerifiedAt(currentConnection.verifiedAt)}
        </div>
      </div>
    </div>
  );
}

function ProviderFields({
  provider,
  setProvider,
}: {
  provider: "smartaccounts" | "merit";
  setProvider: (value: "smartaccounts" | "merit") => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}
    >
      <label
        style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
          Provider
        </span>
        <select
          name="provider"
          className="input-field"
          value={provider}
          onChange={(event) =>
            setProvider(event.target.value as "smartaccounts" | "merit")
          }
        >
          <option value="smartaccounts">SmartAccounts</option>
          <option value="merit">Merit</option>
        </select>
      </label>

      {provider === "smartaccounts" ? (
        <>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              SmartAccounts API key
            </span>
            <input
              name="smartaccountsApiKey"
              type="text"
              className="input-field"
              autoComplete="off"
            />
          </label>

          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              SmartAccounts secret key
            </span>
            <input
              name="smartaccountsSecretKey"
              type="password"
              className="input-field"
              autoComplete="off"
            />
          </label>
        </>
      ) : (
        <>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Merit API ID
            </span>
            <input
              name="meritApiId"
              type="text"
              className="input-field"
              autoComplete="off"
            />
          </label>

          <label
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Merit API key
            </span>
            <input
              name="meritApiKey"
              type="password"
              className="input-field"
              autoComplete="off"
            />
          </label>
        </>
      )}
    </div>
  );
}

function ConnectionStatusMessage({
  message,
  status,
}: {
  message: string;
  status: "success" | "error";
}) {
  const isSuccess = status === "success";

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "0.875rem 1rem",
        borderRadius: "12px",
        border: isSuccess
          ? "1px solid var(--success)"
          : "1px solid var(--error)",
        background: isSuccess ? "var(--success-bg)" : "var(--error-bg)",
        color: isSuccess ? "var(--success)" : "var(--error)",
      }}
    >
      {message}
    </div>
  );
}

export default function ConnectionSettings({
  currentConnection,
}: {
  currentConnection: SavedConnectionSummary | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveAccountingConnection,
    initialSaveConnectionState,
  );
  const [provider, setProvider] = useState<"smartaccounts" | "merit">(
    currentConnection?.provider ?? "smartaccounts",
  );

  return (
    <div
      className="glass-card"
      style={{ padding: "2rem", marginBottom: "2rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            Accounting connection
          </h2>
          <p
            style={{ color: "var(--text-muted)", maxWidth: "44rem", margin: 0 }}
          >
            Choose the accounting system for this signed-in user and save
            credentials after a live validation check.
          </p>
        </div>

        {currentConnection ? (
          <ConnectionSummaryCard currentConnection={currentConnection} />
        ) : null}
      </div>

      <form action={formAction} style={{ marginTop: "1.5rem" }}>
        <ProviderFields provider={provider} setProvider={setProvider} />

        {state.status !== "idle" && state.message && (
          <ConnectionStatusMessage
            message={state.message}
            status={state.status}
          />
        )}

        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Validating…" : "Save and validate connection"}
          </button>
        </div>
      </form>
    </div>
  );
}
