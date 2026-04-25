"use client";

import { useId, useMemo, useState } from "react";
import {
  InvoiceImportDraft,
  InvoiceImportDraftRow,
  InvoiceImportPreviewResult,
} from "@/lib/invoice-import-types";
import { fieldClass, updateRow } from "./InvoiceImportReviewShared";

const sourceArticleSuggestionsLimit = 12;

type SourceArticleOption = NonNullable<
  InvoiceImportPreviewResult["sourceArticleOptions"]
>[number];

function filterSourceArticleOptions(
  options: SourceArticleOption[],
  normalizedValue: string,
) {
  if (!normalizedValue) {
    return options.slice(0, sourceArticleSuggestionsLimit);
  }

  return options
    .filter((option) => {
      const haystack =
        `${option.code} ${option.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedValue);
    })
    .slice(0, sourceArticleSuggestionsLimit);
}

function hasExactMatch(
  options: SourceArticleOption[],
  normalizedValue: string,
) {
  return options.some(
    (option) => option.code.toLowerCase() === normalizedValue,
  );
}

function setSourceArticleCode(
  draft: InvoiceImportDraft,
  rowId: string,
  setDraft: (draft: InvoiceImportDraft) => void,
  value: string | null,
) {
  setDraft(
    updateRow(draft, rowId, (current) => ({
      ...current,
      sourceArticleCode: value,
    })),
  );
}

interface SourceArticleComboboxProps {
  draft: InvoiceImportDraft;
  row: InvoiceImportDraftRow;
  options: NonNullable<InvoiceImportPreviewResult["sourceArticleOptions"]>;
  setDraft: (draft: InvoiceImportDraft) => void;
}

export function SourceArticleCombobox({
  draft,
  row,
  options,
  setDraft,
}: SourceArticleComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();
  const inputValue = row.sourceArticleCode ?? "";
  const normalizedValue = inputValue.trim().toLowerCase();
  const filteredOptions = useMemo(
    () => filterSourceArticleOptions(options, normalizedValue),
    [normalizedValue, options],
  );
  const exactMatch = hasExactMatch(options, normalizedValue);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement)) {
          setIsOpen(false);
        }
      }}
    >
      <div className="flex flex-wrap items-stretch gap-3">
        <input
          className={fieldClass()}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          placeholder="Search existing article codes or type a new one"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSourceArticleCode(
              draft,
              row.id,
              setDraft,
              event.target.value.trim() || null,
            );
            setIsOpen(true);
          }}
        />
        <button
          className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          type="button"
          aria-label="Show source article suggestions"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsOpen((current) => !current)}
        >
          Show all
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Search existing article codes or keep typing to use a new source code.
      </p>
      {isOpen ? (
        <div
          id={listId}
          className="absolute left-0 top-full z-10 mt-2 flex w-full max-w-[560px] flex-col gap-2 rounded-[14px] border border-slate-300 bg-white/95 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900"
          role="listbox"
        >
          {filteredOptions.map((option, index) => (
            <button
              key={`${option.code}-${index}`}
              className="w-full rounded-xl border border-transparent bg-transparent p-[0.8rem_0.9rem] text-left text-sm transition-colors hover:border-indigo-500/20 hover:bg-indigo-500/8"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSourceArticleCode(draft, row.id, setDraft, option.code);
                setIsOpen(false);
              }}
            >
              <strong>{option.code}</strong>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {option.description ?? "No description"}
              </span>
            </button>
          ))}
          {normalizedValue && !exactMatch ? (
            <button
              className="w-full rounded-xl border border-indigo-200 bg-indigo-500/8 p-[0.8rem_0.9rem] text-left text-sm"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSourceArticleCode(
                  draft,
                  row.id,
                  setDraft,
                  inputValue.trim(),
                );
                setIsOpen(false);
              }}
            >
              <strong>Use new code</strong>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {inputValue.trim()}
              </span>
            </button>
          ) : null}
          {!filteredOptions.length && !normalizedValue ? (
            <p className="m-0 rounded-lg px-3 py-2 text-sm text-slate-500">
              No existing article codes available.
            </p>
          ) : null}
          {!filteredOptions.length && normalizedValue && exactMatch ? (
            <p className="m-0 rounded-lg px-3 py-2 text-sm text-slate-500">
              No additional matches found.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
