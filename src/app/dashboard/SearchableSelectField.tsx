"use client";

import { fieldClass } from "./InvoiceImportReviewShared";

export interface SearchableSelectOption {
  label: string;
  searchText?: string;
  value: string;
}

function normalizeSearchQuery(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

export function filterSearchableSelectOptions(
  options: SearchableSelectOption[],
  query: string,
): SearchableSelectOption[] {
  const tokens = normalizeSearchQuery(query);
  if (!tokens.length) {
    return options;
  }

  return options.filter((option) => {
    const haystack = (option.searchText ?? option.label).trim().toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function applySearchFilter(select: HTMLSelectElement, query: string): void {
  const visibleValues = new Set(
    filterSearchableSelectOptions(
      Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => ({
          label: option.label || option.text,
          searchText: option.dataset.searchText,
          value: option.value,
        })),
      query,
    ).map((option) => option.value),
  );

  for (const option of Array.from(select.options)) {
    if (!option.value) {
      option.hidden = false;
      continue;
    }

    option.hidden = !visibleValues.has(option.value);
  }
}

function findSiblingSelect(target: EventTarget | null): HTMLSelectElement | null {
  if (!(target instanceof HTMLInputElement)) {
    return null;
  }

  const container = target.closest("[data-searchable-select-root='true']");
  if (!container) {
    return null;
  }

  const select = container.querySelector("select");
  return select instanceof HTMLSelectElement ? select : null;
}

function resetSearchInput(target: EventTarget | null): void {
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  const container = target.closest("[data-searchable-select-root='true']");
  if (!container) {
    return;
  }

  const searchInput = container.querySelector("input[type='search']");
  if (!(searchInput instanceof HTMLInputElement)) {
    return;
  }

  searchInput.value = "";
  applySearchFilter(target, "");
}

interface SearchableSelectFieldProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchAriaLabel: string;
  searchPlaceholder: string;
  value: string;
}

export function SearchableSelectField({
  disabled = false,
  onChange,
  options,
  placeholder,
  searchAriaLabel,
  searchPlaceholder,
  value,
}: SearchableSelectFieldProps) {
  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-searchable-select-root="true"
    >
      <input
        aria-label={searchAriaLabel}
        autoComplete="off"
        className={fieldClass("min-h-[42px] py-2")}
        disabled={disabled}
        placeholder={searchPlaceholder}
        type="search"
        onChange={(event) => {
          const select = findSiblingSelect(event.target);
          if (select) {
            applySearchFilter(select, event.target.value);
          }
        }}
      />
      <select
        className={fieldClass()}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          resetSearchInput(event.target);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option
            key={option.value}
            data-search-text={option.searchText ?? option.label}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
