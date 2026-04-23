"use client";

import { useState } from "react";
import { fieldClass } from "./InvoiceImportReviewShared";

const amountInputFormatter = new Intl.NumberFormat("et-EE", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  useGrouping: false,
});

export function formatAmountInputValue(
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "";
  }

  return amountInputFormatter.format(value);
}

export function parseAmountInputValue(value: string): number | null {
  const normalizedValue = value.trim().replace(/\s+/gu, "").replace(",", ".");
  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatEditableAmountInputValue(
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "";
  }

  return value.toString().replace(".", ",");
}

interface FormattedAmountInputProps {
  className?: string;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  placeholder?: string;
  value: number | null;
}

export function FormattedAmountInput({
  className = "",
  disabled = false,
  onChange,
  placeholder,
  value,
}: FormattedAmountInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(formatAmountInputValue(value));
  const displayValue = isEditing ? draftValue : formatAmountInputValue(value);

  function handleChange(nextValue: string) {
    setDraftValue(nextValue);

    if (!nextValue.trim()) {
      onChange(null);
      return;
    }

    const parsedValue = parseAmountInputValue(nextValue);
    if (parsedValue !== null) {
      onChange(parsedValue);
    }
  }

  function handleBlur() {
    setIsEditing(false);

    if (!draftValue.trim()) {
      setDraftValue("");
      onChange(null);
      return;
    }

    const parsedValue = parseAmountInputValue(draftValue);
    if (parsedValue === null) {
      setDraftValue(formatAmountInputValue(value));
      return;
    }

    setDraftValue(formatAmountInputValue(parsedValue));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={fieldClass(className)}
      disabled={disabled}
      placeholder={placeholder}
      value={displayValue}
      onBlur={handleBlur}
      onChange={(event) => handleChange(event.target.value)}
      onFocus={() => {
        setDraftValue(formatEditableAmountInputValue(value));
        setIsEditing(true);
      }}
    />
  );
}
