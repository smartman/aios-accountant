import {
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import type {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import {
  FormattedAmountInput,
  formatAmountInputValue,
  parseAmountInputValue,
} from "./FormattedAmountInput";
import { InvoiceImportRowEditorBody } from "./InvoiceImportRowEditorSections";
import { SearchableSelectField } from "./SearchableSelectField";

type HostElement = ReactElement<Record<string, unknown>>;

export function buildRow(
  overrides?: Partial<InvoiceImportDraftRow>,
): InvoiceImportDraftRow {
  return {
    id: "row-1",
    sourceArticleCode: "MAG 275QF E20",
    description: 'MSI MAG 275QF E20 27" LED WQHD monitor',
    quantity: 1,
    unit: "pcs",
    price: 145.08,
    sum: 145.08,
    vatRate: 24,
    taxCode: "VAT24",
    accountCode: "10921",
    accountSelectionReason: "Matched machinery and equipment account.",
    needsManualReview: false,
    manualReviewReason: null,
    reviewed: false,
    selectedArticleCode: "MSIMAG2701",
    selectedArticleDescription: "MSI MAG 275QF E20",
    articleCandidates: [
      {
        code: "MSIMAG2701",
        description: "MSI MAG 275QF E20",
        unit: "pcs",
        purchaseAccountCode: "10921",
        taxCode: "VAT24",
        type: "PRODUCT",
        score: 87,
        reasons: ["Exact source article code match."],
        historyMatches: 2,
        recentInvoiceDate: "2026-04-01",
      },
      {
        code: "MONITOR-ALT",
        description: "Monitor alt",
        unit: "pcs",
        purchaseAccountCode: "10921",
        taxCode: "VAT24",
        type: "PRODUCT",
        score: 72,
        reasons: ["Description match."],
        historyMatches: 1,
        recentInvoiceDate: "2026-03-15",
      },
    ],
    suggestionStatus: "clear",
    ...overrides,
  };
}

function buildDraft(row: InvoiceImportDraftRow): InvoiceImportDraft {
  return {
    provider: "smartaccounts",
    vendor: {
      name: "Vendor OÜ",
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: null,
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
      selectionMode: "existing",
      existingVendorId: "vendor-1",
      existingVendorName: "Vendor OÜ",
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 145.08,
      vatAmount: 34.82,
      totalAmount: 179.9,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
      paymentAccountName: null,
    },
    actions: {
      createVendor: false,
      recordPayment: false,
    },
    rows: [row],
    warnings: [],
    duplicateInvoice: null,
  };
}

function buildExtraction(): InvoiceImportPreviewResult["extraction"] {
  return {
    vendor: {
      name: "Vendor OÜ",
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: null,
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "INV-1",
      referenceNumber: null,
      currency: "EUR",
      issueDate: "2026-04-20",
      dueDate: null,
      entryDate: "2026-04-20",
      amountExcludingVat: 145.08,
      vatAmount: 34.82,
      totalAmount: 179.9,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [],
    warnings: [],
  };
}

export function buildPreview(
  rowOverrides?: Partial<InvoiceImportDraftRow>,
): InvoiceImportPreviewResult {
  const row = buildRow(rowOverrides);

  return {
    provider: "smartaccounts",
    draft: buildDraft(row),
    extraction: buildExtraction(),
    unitOptions: ["pcs", "tk"],
    articleOptions: [
      {
        code: "MSIMAG2701",
        description: "MSI MAG 275QF E20",
        unit: "pcs",
        purchaseAccountCode: "10921",
        taxCode: "VAT24",
        type: "PRODUCT",
      },
      {
        code: "MONITOR-ALT",
        description: "Monitor alt",
        unit: "pcs",
        purchaseAccountCode: "10921",
        taxCode: "VAT24",
        type: "PRODUCT",
      },
    ],
    sourceArticleOptions: [
      {
        code: "MSIMAG2701",
        description: "MSI MAG 275QF E20",
      },
    ],
    referenceData: {
      accounts: [
        { code: "10921", label: "10921 - Machinery and Equipment" },
        { code: "4000", label: "4000 - Services" },
      ],
      taxCodes: [
        { code: "VAT24", description: "24%", rate: 24 },
        { code: "VAT0", description: "0%", rate: 0 },
      ],
      paymentAccounts: [],
    },
  };
}

export function renderTree(
  preview: InvoiceImportPreviewResult,
  setDraft: (draft: InvoiceImportDraft) => void = () => undefined,
) {
  return (
    <InvoiceImportRowEditorBody
      draft={preview.draft}
      row={preview.draft.rows[0]}
      preview={preview}
      setDraft={setDraft}
    />
  );
}

function renderSearchableSelectField(
  props: ComponentProps<typeof SearchableSelectField>,
): ReactNode {
  const selectedLabel =
    props.value === ""
      ? props.placeholder
      : (props.options.find((option) => option.value === props.value)?.label ??
        "");

  return (
    <div className="min-w-0">
      <select
        aria-hidden="true"
        className="sr-only"
        disabled={props.disabled}
        tabIndex={-1}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{props.placeholder}</option>
        {props.options.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="relative min-w-0">
        <input
          aria-label={props.searchAriaLabel}
          disabled={props.disabled}
          readOnly
          value={selectedLabel}
        />
        <button
          aria-label={`Open ${props.searchAriaLabel.toLowerCase()}`}
          disabled={props.disabled}
          type="button"
        >
          ▾
        </button>
      </div>
    </div>
  );
}

function renderFormattedAmountInput(
  props: ComponentProps<typeof FormattedAmountInput>,
): ReactNode {
  return (
    <input
      type="text"
      inputMode="decimal"
      className={props.className}
      disabled={props.disabled}
      placeholder={props.placeholder}
      value={formatAmountInputValue(props.value)}
      onChange={(event) =>
        props.onChange(parseAmountInputValue(event.target.value))
      }
    />
  );
}

function renderFunctionElement(element: ReactElement): ReactNode {
  if (element.type === SearchableSelectField) {
    return renderSearchableSelectField(
      element.props as ComponentProps<typeof SearchableSelectField>,
    );
  }

  if (element.type === FormattedAmountInput) {
    return renderFormattedAmountInput(
      element.props as ComponentProps<typeof FormattedAmountInput>,
    );
  }

  return (element.type as (props: Record<string, unknown>) => ReactNode)(
    element.props as Record<string, unknown>,
  );
}

export function hostProps(element: HostElement) {
  return element.props as {
    children?: ReactNode;
    disabled?: boolean;
    multiple?: boolean;
    onClick?: () => void;
    onChange?: (event: {
      target: { checked?: boolean; files?: File[]; value?: string };
      currentTarget?: { value?: string };
    }) => void;
  };
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }

  if (!isValidElement(node)) {
    return "";
  }

  if (typeof node.type === "function") {
    return textContent(renderFunctionElement(node));
  }

  return textContent(hostProps(node as HostElement).children);
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (typeof node.type === "function") {
    return findElement(renderFunctionElement(node), predicate);
  }

  if (predicate(node)) {
    return node;
  }

  return findElement(hostProps(node as HostElement).children, predicate);
}

export function findButton(node: ReactNode, label: string): HostElement | null {
  return findElement(
    node,
    (element) =>
      typeof element.type === "string" &&
      element.type === "button" &&
      textContent(hostProps(element as HostElement).children).includes(label),
  ) as HostElement | null;
}

function findLabel(node: ReactNode, labelText: string): ReactElement | null {
  return findElement(
    node,
    (element) =>
      typeof element.type === "string" &&
      element.type === "label" &&
      textContent(hostProps(element as HostElement).children).includes(
        labelText,
      ),
  );
}

function findDescendant(node: ReactNode, tagName: string): ReactElement | null {
  return findElement(
    node,
    (element) => typeof element.type === "string" && element.type === tagName,
  );
}

export function findControlByLabel(
  node: ReactNode,
  labelText: string,
  tagName: string,
): HostElement {
  const label = findLabel(node, labelText);
  if (!label) {
    throw new Error(`Expected label "${labelText}" to exist.`);
  }

  const control = findDescendant(label, tagName);
  if (!control) {
    throw new Error(`Expected ${tagName} for label "${labelText}".`);
  }

  return control as HostElement;
}

export function findFirstElementByTag(
  node: ReactNode,
  tagName: string,
): HostElement {
  const element = findDescendant(node, tagName);
  if (!element) {
    throw new Error(`Expected ${tagName} to exist.`);
  }

  return element as HostElement;
}
