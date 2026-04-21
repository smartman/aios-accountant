"use client";

import { useActionState, useState } from "react";
import type { SavedConnectionSummary } from "@/lib/accounting-provider-types";
import {
  initialClearCacheState,
  initialSaveConnectionState,
} from "./action-state";
import {
  clearAccountingConnectionCache,
  saveAccountingConnection,
} from "./actions";

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
    <div className="min-w-[250px] rounded-[14px] border border-slate-300 bg-white/5 p-4 md:p-5">
      <p className="m-0 font-bold">{currentConnection.label}</p>
      <div className="mt-[0.7rem] grid gap-2 text-[0.9rem]">
        <div>
          <span className="text-slate-500">Accounting app: </span>
          <span>{currentConnection.label}</span>
        </div>
        <div>
          <span className="text-slate-500">Public ID: </span>
          <span>
            {formatSavedValue(
              currentConnection.publicId,
              currentConnection.detail,
            )}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Secret: </span>
          <span>
            {formatSavedValue(currentConnection.secretMasked, "Hidden")}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Verified {formatVerifiedAt(currentConnection.verifiedAt)}
        </div>
      </div>
    </div>
  );
}
const fieldLabelClass =
  "text-sm leading-5 text-slate-500 whitespace-normal text-pretty";

function ProviderFields({
  provider,
  setProvider,
}: {
  provider: "smartaccounts" | "merit";
  setProvider: (value: "smartaccounts" | "merit") => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      <label className="flex min-w-0 flex-col gap-2">
        <span className={fieldLabelClass}>Provider</span>
        <select
          name="provider"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
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
          <label className="flex min-w-0 flex-col gap-2">
            <span className={fieldLabelClass}>SmartAccounts API key</span>
            <input
              name="smartaccountsApiKey"
              type="text"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
              autoComplete="off"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className={fieldLabelClass}>SmartAccounts secret key</span>
            <input
              name="smartaccountsSecretKey"
              type="password"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
              autoComplete="off"
            />
          </label>
        </>
      ) : (
        <>
          <label className="flex min-w-0 flex-col gap-2">
            <span className={fieldLabelClass}>Merit API ID</span>
            <input
              name="meritApiId"
              type="text"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
              autoComplete="off"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className={fieldLabelClass}>Merit API key</span>
            <input
              name="meritApiKey"
              type="password"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
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
  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-[0.875rem] ${
        status === "success"
          ? "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-700/80 dark:text-emerald-200"
          : "border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-700/80 dark:text-rose-200"
      }`}
    >
      {message}
    </div>
  );
}

function CacheActionMessage({
  message,
  status,
}: {
  message: string;
  status: "success" | "error";
}) {
  return (
    <div
      className={`mt-3 rounded-lg border px-4 py-3 ${
        status === "success"
          ? "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-700/80 dark:text-emerald-200"
          : "border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-700/80 dark:text-rose-200"
      }`}
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
  const [cacheState, clearCachesAction, clearingCaches] = useActionState(
    clearAccountingConnectionCache,
    initialClearCacheState,
  );
  const [provider, setProvider] = useState<"smartaccounts" | "merit">(
    currentConnection?.provider ?? "smartaccounts",
  );

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-slate-100 p-8 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),_0_4px_6px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-[44rem]">
          <h2 className="mb-2 text-2xl font-semibold">Accounting connection</h2>
          <p className="m-0 text-slate-500 dark:text-slate-400">
            Choose the accounting system for this signed-in user and save
            credentials after a live validation check.
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:items-end">
          {currentConnection ? (
            <ConnectionSummaryCard currentConnection={currentConnection} />
          ) : null}

          {currentConnection ? (
            <form action={clearCachesAction}>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  disabled={clearingCaches}
                >
                  {clearingCaches ? "Clearing cache…" : "Clear cached values"}
                </button>
                {cacheState.status !== "idle" && cacheState.message ? (
                  <CacheActionMessage
                    message={cacheState.message}
                    status={cacheState.status}
                  />
                ) : null}
              </div>
            </form>
          ) : null}
        </div>
      </div>

      <form action={formAction} className="mt-6">
        <ProviderFields provider={provider} setProvider={setProvider} />

        {state.status !== "idle" && state.message && (
          <ConnectionStatusMessage
            message={state.message}
            status={state.status}
          />
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_6px_-1px_rgba(99,102,241,0.2),_0_2px_4px_-1px_rgba(99,102,241,0.1)] whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_10px_15px_-3px_rgba(99,102,241,0.3),_0_4px_6px_-2px_rgba(99,102,241,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
          >
            {pending ? "Validating…" : "Save and validate connection"}
          </button>
        </div>
      </form>
    </div>
  );
}
