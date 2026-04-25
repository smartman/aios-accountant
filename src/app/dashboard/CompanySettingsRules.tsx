"use client";

import { useActionState, useState } from "react";
import type { CompanySummary } from "@/lib/companies/types";
import { initialCompanyActionState } from "./action-state";
import { saveCompanyConfiguration } from "./actions";

const sectionClass =
  "rounded-xl border border-slate-200 bg-slate-100 p-5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08)] sm:p-6 dark:border-slate-700 dark:bg-slate-900";
const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900";
const labelClass = "flex min-w-0 flex-col gap-2 text-sm";
const buttonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800";
const ruleTooltips = {
  fixedAssetThreshold:
    "Invoices at or above this amount are treated as possible fixed assets for AI classification and review.",
  carVatPolicy:
    "Controls how the AI handles VAT on car-related expenses before review.",
  defaultUnit:
    "Used as the fallback unit when invoice rows do not contain a clear unit.",
  costPreference:
    "Free-text company rules that steer expense account selection and uncertainty handling.",
  representationRules:
    "Explains which purchases should be treated as representation, gifts, fringe benefits, or similar special cases.",
  uncertainExpensePolicy:
    "Tells the AI what to do when it cannot confidently choose an account, VAT treatment, or project.",
  usesMeritInventory:
    "Marks inventory handling as available for Merit companies. It does not create new articles automatically.",
  inventoryKeywords:
    "Words that suggest a purchase should be reviewed as stock or inventory.",
  retailExceptions:
    "Vendor-specific instructions for retail purchases that are often ambiguous on receipts.",
  ecommerceExceptions:
    "Vendor-specific instructions for online purchases and marketplace invoices.",
  projectName: "Human-readable project label shown during review.",
  projectCode: "Internal project code used in prompts and review screens.",
  projectDimensionCode:
    "Provider dimension or object code sent to Merit dimensions or SmartAccounts objectId mapping.",
  projectKeywords:
    "Invoice text that should make this project/dimension a likely match.",
  projectVendors: "Vendors commonly linked to this project/dimension.",
  projectDriveHints:
    "Drive folder, email, or source hints that help associate invoices with this project.",
};

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

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group/tooltip relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold leading-none text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 w-64 -translate-x-1/2 rounded-[12px] bg-slate-900 px-3 py-2 text-xs leading-5 text-white opacity-0 shadow-[0_14px_30px_rgba(15,23,42,0.2)] transition duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 dark:bg-slate-700"
      >
        {text}
      </span>
    </span>
  );
}

function TooltipLabel({
  children,
  tooltip,
}: {
  children: string;
  tooltip: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{children}</span>
      <InfoTooltip text={tooltip} />
    </span>
  );
}

function RuleBasics({ company }: { company: CompanySummary }) {
  const config = company.configuration;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className={labelClass}>
          <TooltipLabel tooltip={ruleTooltips.fixedAssetThreshold}>
            Fixed asset threshold
          </TooltipLabel>
          <input
            name="fixedAssetThreshold"
            type="number"
            min="0"
            className={fieldClass}
            defaultValue={config.fixedAssetThreshold}
          />
        </label>
        <label className={labelClass}>
          <TooltipLabel tooltip={ruleTooltips.carVatPolicy}>
            Car VAT policy
          </TooltipLabel>
          <select
            name="carVatPolicy"
            className={fieldClass}
            defaultValue={config.carVatPolicy}
          >
            <option value="mixed-use">Mixed use, 50% VAT</option>
            <option value="business-only">100% business use</option>
            <option value="none">No company cars</option>
          </select>
        </label>
        <label className={labelClass}>
          <TooltipLabel tooltip={ruleTooltips.defaultUnit}>
            Default unit
          </TooltipLabel>
          <input
            name="defaultUnit"
            className={fieldClass}
            defaultValue={config.inventory.defaultUnit}
          />
        </label>
      </div>
      <label className={labelClass}>
        <TooltipLabel tooltip={ruleTooltips.costPreference}>
          Cost preferences
        </TooltipLabel>
        <textarea
          name="costPreference"
          className={fieldClass}
          defaultValue={config.costPreference}
        />
      </label>
      <label className={labelClass}>
        <TooltipLabel tooltip={ruleTooltips.representationRules}>
          Representation and benefit rules
        </TooltipLabel>
        <textarea
          name="representationRules"
          className={fieldClass}
          defaultValue={config.representationRules}
        />
      </label>
      <label className={labelClass}>
        <TooltipLabel tooltip={ruleTooltips.uncertainExpensePolicy}>
          Uncertain expense policy
        </TooltipLabel>
        <textarea
          name="uncertainExpensePolicy"
          className={fieldClass}
          defaultValue={config.uncertainExpensePolicy}
        />
      </label>
    </>
  );
}

function InventoryExceptionFields({ company }: { company: CompanySummary }) {
  const config = company.configuration;
  return (
    <>
      <label className="inline-flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="usesMeritInventory"
          defaultChecked={config.inventory.usesMeritInventory}
        />
        <TooltipLabel tooltip={ruleTooltips.usesMeritInventory}>
          Uses Merit inventory
        </TooltipLabel>
      </label>
      <label className={labelClass}>
        <TooltipLabel tooltip={ruleTooltips.inventoryKeywords}>
          Inventory keywords
        </TooltipLabel>
        <textarea
          name="inventoryKeywords"
          className={fieldClass}
          defaultValue={config.inventory.inventoryKeywords}
        />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className={labelClass}>
          <TooltipLabel tooltip={ruleTooltips.retailExceptions}>
            Retail vendor exceptions
          </TooltipLabel>
          <textarea
            name="retailExceptions"
            className={fieldClass}
            defaultValue={config.vendorExceptions.retail}
          />
        </label>
        <label className={labelClass}>
          <TooltipLabel tooltip={ruleTooltips.ecommerceExceptions}>
            E-commerce exceptions
          </TooltipLabel>
          <textarea
            name="ecommerceExceptions"
            className={fieldClass}
            defaultValue={config.vendorExceptions.ecommerce}
          />
        </label>
      </div>
    </>
  );
}

type ProjectRule = CompanySummary["configuration"]["projects"][number];
type ProjectRuleRowState = {
  index: number;
  project: ProjectRule | null;
};

function ProjectRules({ projects }: { projects: ProjectRule[] }) {
  const [rows, setRows] = useState<ProjectRuleRowState[]>(() =>
    projects.map((project, index) => ({
      index,
      project,
    })),
  );

  function handleAddRow() {
    setRows((current) => {
      const nextIndex =
        current.reduce((highest, row) => Math.max(highest, row.index), -1) + 1;
      return [...current, { index: nextIndex, project: null }];
    });
  }

  function handleDeleteRow(index: number) {
    setRows((current) => current.filter((row) => row.index !== index));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-base font-semibold">Projects and dimensions</h4>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={handleAddRow}
        >
          Add configuration row
        </button>
      </div>
      {rows.length ? (
        rows.map(({ index, project }) => (
          <ProjectRuleRow
            key={index}
            index={index}
            project={project}
            onDelete={() => handleDeleteRow(index)}
          />
        ))
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300/80 px-3 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No project or dimension rules configured.
        </p>
      )}
    </div>
  );
}

function ProjectRuleRow({
  index,
  onDelete,
  project,
}: {
  index: number;
  onDelete: () => void;
  project: ProjectRule | null;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-300/60 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="projectRowIndex" value={index} />
        <input
          type="hidden"
          name={`projectId${index}`}
          value={project?.id ?? `project-${index + 1}`}
        />
        <span className="text-sm font-semibold">Configuration row</span>
        <button
          type="button"
          className="text-sm font-semibold text-rose-600"
          onClick={onDelete}
        >
          Delete row
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <ProjectTextInput
          name={`projectName${index}`}
          label="Project name"
          tooltip={ruleTooltips.projectName}
          value={project?.name ?? ""}
        />
        <ProjectTextInput
          name={`projectCode${index}`}
          label="Project code"
          tooltip={ruleTooltips.projectCode}
          value={project?.code ?? ""}
        />
        <ProjectTextInput
          name={`projectDimensionCode${index}`}
          label="Dimension/object code"
          tooltip={ruleTooltips.projectDimensionCode}
          value={project?.providerDimensionCode ?? ""}
        />
        <ProjectTextInput
          name={`projectKeywords${index}`}
          label="Invoice keywords"
          tooltip={ruleTooltips.projectKeywords}
          value={project?.invoiceKeywords ?? ""}
        />
        <ProjectTextInput
          name={`projectVendors${index}`}
          label="Related vendors"
          tooltip={ruleTooltips.projectVendors}
          value={project?.relatedVendors ?? ""}
        />
        <ProjectTextInput
          name={`projectDriveHints${index}`}
          label="Drive/email hints"
          tooltip={ruleTooltips.projectDriveHints}
          value={project?.driveFolderHints ?? ""}
        />
      </div>
    </div>
  );
}

function ProjectTextInput({
  label,
  name,
  tooltip,
  value,
}: {
  label: string;
  name: string;
  tooltip: string;
  value: string;
}) {
  return (
    <label className={labelClass}>
      <TooltipLabel tooltip={tooltip}>{label}</TooltipLabel>
      <input name={name} className={fieldClass} defaultValue={value} />
    </label>
  );
}

export default function CompanySettingsRules({
  company,
}: {
  company: CompanySummary;
}) {
  const [isExpanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveCompanyConfiguration,
    initialCompanyActionState,
  );

  return (
    <section className={sectionClass}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={isExpanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <h3 className="text-xl font-semibold">Advanced AI rules</h3>
        <span
          aria-hidden="true"
          className="text-xl leading-none text-slate-500"
        >
          {isExpanded ? "-" : "+"}
        </span>
      </button>
      {isExpanded ? (
        <form action={formAction} className="mt-5 grid gap-4">
          <input type="hidden" name="companyId" value={company.id} />
          <RuleBasics company={company} />
          <InventoryExceptionFields company={company} />
          <ProjectRules projects={company.configuration.projects} />
          <div className="flex justify-end">
            <button type="submit" className={buttonClass} disabled={pending}>
              {pending ? "Saving..." : "Save rules"}
            </button>
          </div>
          <ActionMessage status={state.status} message={state.message} />
        </form>
      ) : null}
    </section>
  );
}
