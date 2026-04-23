// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  FormattedAmountInput,
  formatAmountInputValue,
  parseAmountInputValue,
} from "./FormattedAmountInput";

function ControlledFormattedAmountInput({
  initialValue = 224.8,
  onChange = vi.fn(),
}: {
  initialValue?: number | null;
  onChange?: (value: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initialValue);

  return (
    <FormattedAmountInput
      placeholder="Amount"
      value={value}
      onChange={(nextValue) => {
        onChange(nextValue);
        setValue(nextValue);
      }}
    />
  );
}

afterEach(() => {
  cleanup();
});

it("formats amount values with two decimal places using a comma", () => {
  expect(formatAmountInputValue(224.8)).toBe("224,80");
  expect(formatAmountInputValue(4)).toBe("4,00");
  expect(formatAmountInputValue(null)).toBe("");
  expect(formatAmountInputValue(Number.NaN)).toBe("");
});

it("parses dot and comma decimal inputs", () => {
  expect(parseAmountInputValue("224,80")).toBe(224.8);
  expect(parseAmountInputValue("181.29")).toBe(181.29);
  expect(parseAmountInputValue(" 1 024,50 ")).toBe(1024.5);
  expect(parseAmountInputValue("invalid")).toBeNull();
  expect(parseAmountInputValue("")).toBeNull();
});

it("rounds edited values to two decimals on blur", () => {
  const onChange = vi.fn();

  render(<ControlledFormattedAmountInput onChange={onChange} />);

  const input = screen.getByPlaceholderText("Amount") as HTMLInputElement;

  expect(input.value).toBe("224,80");

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "145,087" } });

  expect(input.value).toBe("145,087");
  expect(onChange).toHaveBeenCalledWith(145.087);

  fireEvent.blur(input);

  expect(input.value).toBe("145,09");
  expect(onChange).toHaveBeenLastCalledWith(145.09);
});

it("clears the value when the field is emptied", () => {
  const onChange = vi.fn();

  render(
    <ControlledFormattedAmountInput
      initialValue={181.29}
      onChange={onChange}
    />,
  );

  const input = screen.getByPlaceholderText("Amount") as HTMLInputElement;

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "" } });

  expect(onChange).toHaveBeenCalledWith(null);

  fireEvent.blur(input);

  expect(input.value).toBe("");
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it("restores the last valid value when the draft is invalid", () => {
  const onChange = vi.fn();

  render(
    <ControlledFormattedAmountInput
      initialValue={181.29}
      onChange={onChange}
    />,
  );

  const input = screen.getByPlaceholderText("Amount") as HTMLInputElement;

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "abc" } });
  fireEvent.blur(input);

  expect(input.value).toBe("181,29");
  expect(onChange).not.toHaveBeenCalled();
});
