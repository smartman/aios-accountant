"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { type KeyboardEvent, useState } from "react";
import { fieldClass } from "./InvoiceImportReviewShared";

export interface SearchableSelectOption {
  label: string;
  searchText?: string;
  value: string;
}

function normalizeSearchQuery(value: string): string[] {
  return value.trim().toLowerCase().split(/\s+/u).filter(Boolean);
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

interface SearchableSelectFieldProps {
  disabled?: boolean;
  emptyStateText?: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchAriaLabel: string;
  value: string;
}

function buildVisibleOptions(
  options: SearchableSelectOption[],
  placeholder: string,
): SearchableSelectOption[] {
  return [
    {
      label: placeholder,
      searchText: placeholder,
      value: "",
    },
    ...options,
  ];
}

function isPrintableSearchKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  return (
    event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
  );
}

function VisibleSearchableSelect({
  disabled = false,
  emptyStateText = "No matches found.",
  onChange,
  options,
  placeholder,
  searchAriaLabel,
  value,
}: SearchableSelectFieldProps) {
  const visibleOptions = buildVisibleOptions(options, placeholder);
  const [query, setQuery] = useState("");
  const selectedOption =
    visibleOptions.find((option) => option.value === value) ?? null;
  const filteredOptions = filterSearchableSelectOptions(visibleOptions, query);
  const inputValue = query || selectedOption?.label || "";

  function handleComboboxChange(option: SearchableSelectOption | null) {
    onChange(option?.value ?? "");
  }

  function handleComboboxClose() {
    setQuery("");
  }

  function handleInputChange(event: { target: { value: string } }) {
    setQuery(event.target.value);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!selectedOption || query) {
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      setQuery("");
      return;
    }

    if (isPrintableSearchKey(event)) {
      event.preventDefault();
      setQuery(event.key);
    }
  }

  return (
    <Combobox
      immediate
      disabled={disabled}
      value={selectedOption}
      by="value"
      onChange={handleComboboxChange}
      onClose={handleComboboxClose}
    >
      <div className="relative min-w-0">
        <ComboboxInput<SearchableSelectOption | null>
          aria-label={searchAriaLabel}
          autoComplete="off"
          className={fieldClass(
            "pr-12 shadow-[0_0_0_1px_rgba(99,102,241,0)] transition-shadow focus:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
          )}
          data-searchable-select-input="true"
          displayValue={() => inputValue}
          placeholder={placeholder}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center text-[11px] text-slate-400 dark:text-slate-400"
        >
          ▾
        </span>

        <ComboboxOptions
          anchor="bottom start"
          transition
          className="isolate z-30 mt-2 max-h-64 w-[var(--input-width)] overflow-auto rounded-[16px] border border-slate-200 bg-white p-2 shadow-[0_22px_45px_rgba(15,23,42,0.16)] ring-1 ring-slate-950/5 empty:invisible data-[closed]:opacity-0 data-[leave]:transition data-[leave]:duration-100 data-[leave]:ease-in dark:border-slate-700 dark:bg-slate-950 dark:ring-white/10"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <ComboboxOption
                key={option.value}
                as="button"
                className="group flex w-full items-center rounded-[12px] border border-transparent px-3 py-2.5 text-left text-sm text-slate-700 transition-colors data-[focus]:border-indigo-200 data-[focus]:bg-indigo-50 data-[focus]:text-slate-900 dark:text-slate-200 dark:data-[focus]:border-indigo-500/20 dark:data-[focus]:bg-indigo-500/10 dark:data-[focus]:text-white"
                type="button"
                value={option}
              >
                {({ selected }) => (
                  <>
                    <span className="flex-1">{option.label}</span>
                    {selected ? (
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                        Selected
                      </span>
                    ) : null}
                  </>
                )}
              </ComboboxOption>
            ))
          ) : (
            <div className="rounded-[12px] px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
              {emptyStateText}
            </div>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}

export function SearchableSelectField({
  disabled = false,
  emptyStateText = "No matches found.",
  onChange,
  options,
  placeholder,
  searchAriaLabel,
  value,
}: SearchableSelectFieldProps) {
  return (
    <div className="min-w-0">
      <select
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
        tabIndex={-1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <VisibleSearchableSelect
        disabled={disabled}
        emptyStateText={emptyStateText}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        searchAriaLabel={searchAriaLabel}
        value={value}
      />
    </div>
  );
}
