"use client";

import { useActionState, useState } from "react";
import type { CompanySummary } from "@/lib/companies/types";
import { EMTAK_RECORDS } from "@/lib/companies/emtak";
import { initialCompanyActionState } from "./action-state";
import {
  deleteCompanyFromForm,
  inviteCompanyMember,
  removeCompanyInvitationFromForm,
  removeCompanyMemberFromForm,
  saveCompanyProfile,
} from "./actions";
import ConnectionSettings from "./ConnectionSettings";
import CompanySettingsRules from "./CompanySettingsRules";
import {
  SearchableSelectField,
  type SearchableSelectOption,
} from "./SearchableSelectField";

const sectionClass =
  "rounded-xl border border-slate-200 bg-slate-100 p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08)] sm:p-6 dark:border-slate-700 dark:bg-slate-900";
const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900";
const labelClass = "flex min-w-0 flex-col gap-2 text-sm";
const buttonClass =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60";
const emtakOptions: SearchableSelectOption[] = EMTAK_RECORDS.map((record) => ({
  label: `${record.code} - ${record.label}`,
  searchText: `${record.code} ${record.label}`,
  value: record.code,
}));

function ActionMessage({
  message,
  status,
}: {
  message?: string;
  status: "idle" | "success" | "error";
}) {
  if (status === "idle" || !message) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        status === "success"
          ? "border-emerald-300 bg-emerald-500/10 text-emerald-700"
          : "border-rose-300 bg-rose-500/10 text-rose-700"
      }`}
    >
      {message}
    </div>
  );
}

function CompanyProfileForm({ company }: { company: CompanySummary }) {
  const [state, formAction, pending] = useActionState(
    saveCompanyProfile,
    initialCompanyActionState,
  );
  const [emtakCode, setEmtakCode] = useState(company.emtakCode);

  return (
    <section className={sectionClass}>
      <h3 className="text-xl font-semibold">Company profile</h3>
      <form action={formAction} className="mt-5 grid gap-4 lg:grid-cols-2">
        <input type="hidden" name="companyId" value={company.id} />
        <label className={labelClass}>
          <span>Company name</span>
          <input
            name="companyName"
            className={fieldClass}
            defaultValue={company.name}
            required
          />
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
        <input
          type="hidden"
          name="accountingProvider"
          value={company.accountingProvider}
        />
        <div className="flex items-end justify-end">
          <button type="submit" className={buttonClass} disabled={pending}>
            {pending ? "Saving..." : "Save profile"}
          </button>
        </div>
        <div className="lg:col-span-2">
          <ActionMessage status={state.status} message={state.message} />
        </div>
      </form>
    </section>
  );
}

function UsersSection({
  company,
  userEmail,
}: {
  company: CompanySummary;
  userEmail: string;
}) {
  const [state, formAction, pending] = useActionState(
    inviteCompanyMember,
    initialCompanyActionState,
  );
  const normalizedUserEmail = userEmail.toLowerCase();
  const canRemoveOtherUsers = company.members.length > 1;

  return (
    <section className={sectionClass}>
      <h3 className="text-xl font-semibold">Users</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        All company users have the same admin access.
      </p>
      <form
        action={formAction}
        className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <input type="hidden" name="companyId" value={company.id} />
        <input
          name="email"
          type="email"
          className={fieldClass}
          placeholder="user@example.com"
          required
        />
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Adding..." : "Add user"}
        </button>
      </form>
      <div className="mt-3">
        <ActionMessage status={state.status} message={state.message} />
      </div>
      <div className="mt-5 grid gap-3">
        {company.members.map((member) => {
          const isCurrentUser = member.email === normalizedUserEmail;
          return (
            <form
              key={member.id}
              action={removeCompanyMemberFromForm}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300/60 px-3 py-2 dark:border-slate-700"
            >
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="membershipId" value={member.id} />
              <span className="text-sm">
                {member.email}
                {isCurrentUser ? " (you)" : ""}
              </span>
              {isCurrentUser ? (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Current user
                </span>
              ) : (
                <button
                  className="text-sm font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canRemoveOtherUsers}
                >
                  Remove
                </button>
              )}
            </form>
          );
        })}
        {company.invitations.map((invitation) => (
          <form
            key={invitation.id}
            action={removeCompanyInvitationFromForm}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300/80 px-3 py-2 dark:border-slate-700"
          >
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="invitationId" value={invitation.id} />
            <span className="text-sm">{invitation.email} (pending)</span>
            <button className="text-sm font-semibold text-rose-600">
              Cancel
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

function DeleteCompanySection({ company }: { company: CompanySummary }) {
  return (
    <section className={sectionClass}>
      <h3 className="text-xl font-semibold">Delete company</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        This removes the company, accounting credentials, invitations, user
        access, and saved configuration.
      </p>
      <form
        action={deleteCompanyFromForm}
        className="mt-5"
        onSubmit={(event) => {
          if (
            !window.confirm(`Delete ${company.name}? This cannot be undone.`)
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="companyId" value={company.id} />
        <button type="submit" className={dangerButtonClass}>
          Delete company
        </button>
      </form>
    </section>
  );
}

export default function CompanySettings({
  company,
  userEmail,
}: {
  company: CompanySummary;
  userEmail: string;
}) {
  return (
    <div className="grid gap-6">
      <CompanyProfileForm company={company} />
      <ConnectionSettings
        companyId={company.id}
        currentConnection={company.connectionSummary}
        provider={company.accountingProvider}
      />
      <CompanySettingsRules company={company} />
      <UsersSection company={company} userEmail={userEmail} />
      <DeleteCompanySection company={company} />
    </div>
  );
}
