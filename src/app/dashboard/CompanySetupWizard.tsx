"use client";

import { useActionState, useEffect, useState } from "react";
import { EMTAK_RECORDS } from "@/lib/companies/emtak";
import { initialCompanyActionState } from "./action-state";
import { createInitialCompany } from "./actions";
import {
  SearchableSelectField,
  type SearchableSelectOption,
} from "./SearchableSelectField";

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900";
const labelClass = "flex min-w-0 flex-col gap-2 text-sm";
const helperClass = "text-sm text-slate-500 dark:text-slate-400";
const emtakOptions: SearchableSelectOption[] = EMTAK_RECORDS.map((record) => ({
  label: `${record.code} - ${record.label}`,
  searchText: `${record.code} ${record.label}`,
  value: record.code,
}));

function WizardActions({
  onCancel,
  pending,
}: {
  onCancel?: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-3">
      {onCancel ? (
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={onCancel}
        >
          Cancel
        </button>
      ) : null}
      <button
        type="submit"
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Creating..." : "Create company"}
      </button>
    </div>
  );
}

export default function CompanySetupWizard({
  mode = "first",
  onCancel,
}: {
  mode?: "first" | "additional";
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createInitialCompany,
    initialCompanyActionState,
  );
  const [emtakCode, setEmtakCode] = useState("69202");

  useEffect(() => {
    if (state.status === "success" && state.companyId) {
      window.location.href = `/dashboard?companyId=${state.companyId}`;
    }
  }, [state]);

  return (
    <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-slate-100 p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08)] sm:p-8 dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {mode === "first" ? "First company" : "New company"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
          Create an Estonia company
        </h2>
        <p className={`mt-2 ${helperClass}`}>
          {mode === "first"
            ? "Start with the required company profile. Credentials and detailed accounting rules can be added after this step."
            : "Create another company profile. Credentials and detailed accounting rules can be added after this step."}
        </p>
      </div>

      <form action={formAction} className="mt-6 grid gap-5">
        <label className={labelClass}>
          <span>Company name</span>
          <input name="companyName" className={fieldClass} required />
        </label>

        <label className={labelClass}>
          <span>Country</span>
          <input type="hidden" name="countryCode" value="EE" />
          <select className={fieldClass} value="EE" disabled>
            <option value="EE">Estonia</option>
          </select>
        </label>

        <label className={labelClass}>
          <span>EMTAK activity</span>
          <SearchableSelectField
            name="emtakCode"
            options={emtakOptions}
            placeholder="Select EMTAK activity"
            searchAriaLabel="Search EMTAK activities"
            value={emtakCode}
            onChange={setEmtakCode}
          />
        </label>

        <label className={labelClass}>
          <span>Accounting provider</span>
          <select name="accountingProvider" className={fieldClass}>
            <option value="smartaccounts">SmartAccounts</option>
            <option value="merit">Merit</option>
          </select>
        </label>

        {state.status !== "idle" && state.message ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              state.status === "success"
                ? "border-emerald-300 bg-emerald-500/10 text-emerald-700"
                : "border-rose-300 bg-rose-500/10 text-rose-700"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <WizardActions onCancel={onCancel} pending={pending} />
      </form>
    </section>
  );
}
