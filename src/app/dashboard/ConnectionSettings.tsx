"use client";

import { useActionState, useEffect, useState } from "react";
import type { SavedConnectionSummary } from "@/lib/accounting-provider-types";
import {
  type ClearCacheState,
  initialClearCacheState,
  initialSaveConnectionState,
} from "./action-state";
import {
  clearAccountingConnectionCache,
  saveAccountingConnection,
} from "./actions";

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
    <dl className="grid gap-4 text-sm md:grid-cols-3">
      <div className="flex min-w-0 gap-2">
        <dt className="text-slate-500 dark:text-slate-400">Status</dt>
        <dd className="min-w-0 truncate font-semibold text-emerald-700 dark:text-emerald-300">
          Connected to {currentConnection.label}
        </dd>
      </div>
      <div className="flex min-w-0 gap-2">
        <dt className="text-slate-500 dark:text-slate-400">Public ID</dt>
        <dd className="min-w-0 truncate">
          {formatSavedValue(
            currentConnection.publicId,
            currentConnection.detail,
          )}
        </dd>
      </div>
      <div className="flex min-w-0 gap-2">
        <dt className="text-slate-500 dark:text-slate-400">Secret</dt>
        <dd className="min-w-0 truncate">
          {formatSavedValue(currentConnection.secretMasked, "Hidden")}
        </dd>
      </div>
    </dl>
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
      className={`rounded-lg border px-4 py-3 ${
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
      className={`rounded-lg border px-3 py-2 text-sm ${
        status === "success"
          ? "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-700/80 dark:text-emerald-200"
          : "border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-700/80 dark:text-rose-200"
      }`}
    >
      {message}
    </div>
  );
}

function ConnectionSettingsHeader({
  currentConnection,
  isExpanded,
  onToggle,
}: {
  currentConnection: SavedConnectionSummary | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!currentConnection) {
    return (
      <div>
        <h2 className="text-xl font-semibold">Accounting connection</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Save credentials for this company after a live validation check.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-4 text-left"
      aria-expanded={isExpanded}
      onClick={onToggle}
    >
      <div>
        <h2 className="text-xl font-semibold">Accounting connection</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Connected to {currentConnection.label}.
        </p>
      </div>
      <span aria-hidden="true" className="text-xl leading-none text-slate-500">
        {isExpanded ? "-" : "+"}
      </span>
    </button>
  );
}

function ConnectionDetails({
  cacheState,
  clearCachesAction,
  clearingCaches,
  companyId,
  currentConnection,
}: {
  cacheState: ClearCacheState;
  clearCachesAction: (payload: FormData) => void | Promise<void>;
  clearingCaches: boolean;
  companyId: string;
  currentConnection: SavedConnectionSummary | null;
}) {
  if (!currentConnection && cacheState.status === "idle") {
    return null;
  }

  return (
    <div className="mt-4 grid gap-4">
      {currentConnection ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Save credentials for this company after a live validation check.
          </p>
          <form action={clearCachesAction}>
            <input type="hidden" name="companyId" value={companyId} />
            <button
              type="submit"
              className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              disabled={clearingCaches}
            >
              {clearingCaches ? "Clearing cache..." : "Clear cached values"}
            </button>
          </form>
        </div>
      ) : null}

      {currentConnection ? (
        <ConnectionSummaryCard currentConnection={currentConnection} />
      ) : null}

      {cacheState.status !== "idle" && cacheState.message ? (
        <CacheActionMessage
          message={cacheState.message}
          status={cacheState.status}
        />
      ) : null}
    </div>
  );
}

export default function ConnectionSettings({
  companyId,
  currentConnection,
  provider,
}: {
  companyId: string;
  currentConnection: SavedConnectionSummary | null;
  provider: "smartaccounts" | "merit";
}) {
  const [state, formAction, pending] = useActionState(
    saveAccountingConnection,
    initialSaveConnectionState,
  );
  const [cacheState, clearCachesAction, clearingCaches] = useActionState(
    clearAccountingConnectionCache,
    initialClearCacheState,
  );
  const [isExpanded, setExpanded] = useState(currentConnection === null);
  const [selectedProvider, setProvider] = useState<"smartaccounts" | "merit">(
    provider,
  );

  useEffect(() => {
    setExpanded(currentConnection === null);
  }, [currentConnection]);

  useEffect(() => {
    setProvider(provider);
  }, [provider]);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-100 p-5 shadow-[0_8px_18px_-12px_rgba(15,23,42,0.35)] sm:p-6 dark:border-slate-700 dark:bg-slate-900">
      <ConnectionSettingsHeader
        currentConnection={currentConnection}
        isExpanded={isExpanded}
        onToggle={() => setExpanded((current) => !current)}
      />

      {isExpanded ? (
        <>
          <ConnectionDetails
            cacheState={cacheState}
            clearCachesAction={clearCachesAction}
            clearingCaches={clearingCaches}
            companyId={companyId}
            currentConnection={currentConnection}
          />
          <form action={formAction} className="mt-4 grid gap-4">
            <input type="hidden" name="companyId" value={companyId} />
            <ProviderFields
              provider={selectedProvider}
              setProvider={setProvider}
            />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              {state.status === "error" && state.message ? (
                <ConnectionStatusMessage
                  message={state.message}
                  status={state.status}
                />
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_6px_-1px_rgba(99,102,241,0.2),_0_2px_4px_-1px_rgba(99,102,241,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_10px_15px_-3px_rgba(99,102,241,0.3),_0_4px_6px_-2px_rgba(99,102,241,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
              >
                {pending ? "Validating..." : "Save and validate connection"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
