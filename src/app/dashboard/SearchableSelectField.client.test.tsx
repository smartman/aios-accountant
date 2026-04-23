import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

interface CapturedComboboxProps {
  onChange?: (option: { value: string } | null) => void;
  onClose?: () => void;
}

interface CapturedComboboxInputProps {
  onChange?: (event: { target: { value: string } }) => void;
  onKeyDown?: (event: {
    altKey?: boolean;
    ctrlKey?: boolean;
    key: string;
    metaKey?: boolean;
    preventDefault: () => void;
  }) => void;
}

const mockState = vi.hoisted(() => ({
  capturedComboboxProps: null as CapturedComboboxProps | null,
  capturedInputProps: null as CapturedComboboxInputProps | null,
}));

vi.mock("@headlessui/react", async () => {
  const react = await import("react");
  const ComboboxContext = react.createContext<{
    selectedValue: string | null;
  } | null>(null);

  return {
    Combobox: ({
      children,
      onChange,
      onClose,
      value,
    }: {
      children: React.ReactNode;
      onChange?: (option: { value: string } | null) => void;
      onClose?: () => void;
      value: { value: string } | null;
    }) => {
      mockState.capturedComboboxProps = { onChange, onClose };

      return (
        <ComboboxContext.Provider
          value={{ selectedValue: value?.value ?? null }}
        >
          <div data-headlessui-combobox="true">{children}</div>
        </ComboboxContext.Provider>
      );
    },
    ComboboxButton: ({
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"button">) => (
      <button {...props}>{children}</button>
    ),
    ComboboxInput: ({
      displayValue,
      ...props
    }: React.ComponentPropsWithoutRef<"input"> & {
      displayValue?: (value: { label: string } | null) => string;
    }) => {
      mockState.capturedInputProps = {
        onChange: props.onChange as CapturedComboboxInputProps["onChange"],
        onKeyDown: props.onKeyDown as CapturedComboboxInputProps["onKeyDown"],
      };

      const context = react.useContext(ComboboxContext);
      const selectedOption =
        context?.selectedValue == null
          ? null
          : { label: context.selectedValue };

      return (
        <input
          {...props}
          readOnly
          value={displayValue?.(selectedOption) ?? props.value ?? ""}
        />
      );
    },
    ComboboxOption: ({
      as: Component = "div",
      children,
      value,
      ...props
    }: {
      as?: keyof React.JSX.IntrinsicElements;
      children:
        | React.ReactNode
        | ((params: { selected: boolean }) => React.ReactNode);
      value: { value: string };
    } & Record<string, unknown>) => {
      const context = react.useContext(ComboboxContext);
      const selected = context?.selectedValue === value.value;

      return (
        <Component {...props}>
          {typeof children === "function" ? children({ selected }) : children}
        </Component>
      );
    },
    ComboboxOptions: ({
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"div">) => (
      <div {...props}>{children}</div>
    ),
  };
});

import { __test__, SearchableSelectField } from "./SearchableSelectField";

function getHiddenSelect(
  element: React.ReactElement<{ children: React.ReactNode }>,
): React.ReactElement<{
  children: React.ReactNode;
  onChange: (event: { target: { value: string } }) => void;
}> {
  const children = React.Children.toArray(element.props.children);

  return children[0] as React.ReactElement<{
    children: React.ReactNode;
    onChange: (event: { target: { value: string } }) => void;
  }>;
}

beforeEach(() => {
  mockState.capturedComboboxProps = null;
  mockState.capturedInputProps = null;
});

it("renders the client combobox path with the selected badge", () => {
  const markup = renderToStaticMarkup(
    <SearchableSelectField
      options={[
        {
          label: "4000 - Consulting services",
          searchText: "4000 Consulting services",
          value: "4000",
        },
      ]}
      placeholder="Select account"
      searchAriaLabel="Search purchase accounts"
      value="4000"
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('data-headlessui-combobox="true"');
  expect(markup).toContain("Selected");
  expect(markup).toContain('class="sr-only"');
  expect(markup).toContain("!bg-white");
  expect(markup).toContain('data-searchable-select-chevron="true"');
  expect(markup).toContain('viewBox="0 0 16 16"');
});

it("renders the empty state when filtering leaves no matching options", () => {
  const markup = renderToStaticMarkup(
    <SearchableSelectField
      emptyStateText="Nothing available"
      options={[]}
      placeholder="No VAT code"
      searchAriaLabel="Search VAT codes"
      value=""
      onChange={() => undefined}
    />,
  );

  expect(markup).not.toContain("Nothing available");

  mockState.capturedInputProps?.onChange?.({
    target: { value: "missing" },
  });
});

it("hides the static display label once the user starts typing a query", () => {
  const markup = renderToStaticMarkup(
    <__test__.SearchableSelectDisplay
      label="10921 - Machinery and Equipment"
      muted={false}
      visible={false}
    />,
  );

  expect(markup).toBe("");
});

it("wires combobox callbacks to selection behavior", () => {
  const onChange = vi.fn();

  renderToStaticMarkup(
    <SearchableSelectField
      options={[
        {
          label: "10921 - Machinery and Equipment",
          searchText: "10921 Machinery and Equipment",
          value: "10921",
        },
      ]}
      placeholder="Select account"
      searchAriaLabel="Search purchase accounts"
      value="10921"
      onChange={onChange}
    />,
  );

  mockState.capturedComboboxProps?.onChange?.({ value: "10921" });
  mockState.capturedComboboxProps?.onChange?.(null);
  mockState.capturedComboboxProps?.onClose?.();

  expect(onChange).toHaveBeenNthCalledWith(1, "10921");
  expect(onChange).toHaveBeenNthCalledWith(2, "");
});

it("replaces the selected label with the first typed search character", () => {
  const preventDefaultSpy = vi.fn();

  renderToStaticMarkup(
    <SearchableSelectField
      options={[
        {
          label: "10921 - Machinery and Equipment",
          searchText: "10921 Machinery and Equipment",
          value: "10921",
        },
      ]}
      placeholder="Select account"
      searchAriaLabel="Search purchase accounts"
      value="10921"
      onChange={() => undefined}
    />,
  );

  mockState.capturedInputProps?.onKeyDown?.({
    key: "m",
    preventDefault: preventDefaultSpy,
  });

  expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
});

it("clears the selected label when delete is pressed", () => {
  const preventDefaultSpy = vi.fn();

  renderToStaticMarkup(
    <SearchableSelectField
      options={[
        {
          label: "10921 - Machinery and Equipment",
          searchText: "10921 Machinery and Equipment",
          value: "10921",
        },
      ]}
      placeholder="Select account"
      searchAriaLabel="Search purchase accounts"
      value="10921"
      onChange={() => undefined}
    />,
  );

  mockState.capturedInputProps?.onKeyDown?.({
    key: "Delete",
    preventDefault: preventDefaultSpy,
  });

  expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
});

it("lets typing start from the blank placeholder option", () => {
  const preventDefaultSpy = vi.fn();

  renderToStaticMarkup(
    <SearchableSelectField
      options={[
        {
          label: "VAT24 - 24% VAT",
          searchText: "VAT24 24% VAT",
          value: "VAT24",
        },
      ]}
      placeholder="No VAT code"
      searchAriaLabel="Search VAT codes"
      value=""
      onChange={() => undefined}
    />,
  );

  mockState.capturedInputProps?.onKeyDown?.({
    key: "v",
    preventDefault: preventDefaultSpy,
  });

  expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
});

it("does not intercept typing when the current value is outside the option list", () => {
  const preventDefaultSpy = vi.fn();

  renderToStaticMarkup(
    <SearchableSelectField
      options={[
        {
          label: "10921 - Machinery and Equipment",
          searchText: "10921 Machinery and Equipment",
          value: "10921",
        },
      ]}
      placeholder="Select account"
      searchAriaLabel="Search purchase accounts"
      value="MISSING"
      onChange={() => undefined}
    />,
  );

  mockState.capturedInputProps?.onKeyDown?.({
    key: "m",
    preventDefault: preventDefaultSpy,
  });

  expect(preventDefaultSpy).not.toHaveBeenCalled();
});

it("keeps the hidden select synced on the client path", () => {
  const onChange = vi.fn();

  const element = SearchableSelectField({
    onChange,
    options: [
      {
        label: "10921 - Machinery and Equipment",
        searchText: "10921 Machinery and Equipment",
        value: "10921",
      },
      {
        label: "4000 - Consulting services",
        searchText: "4000 Consulting services",
        value: "4000",
      },
    ],
    placeholder: "Select account",
    searchAriaLabel: "Search purchase accounts",
    value: "10921",
  });

  const select = getHiddenSelect(element);
  const optionChildren = React.Children.toArray(select.props.children);

  select.props.onChange({ target: { value: "4000" } });

  expect(optionChildren).toHaveLength(3);
  expect(onChange).toHaveBeenCalledWith("4000");
});
