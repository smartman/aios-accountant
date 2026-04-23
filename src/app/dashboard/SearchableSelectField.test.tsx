import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@headlessui/react", async () => {
  const react = await import("react");
  const ComboboxContext = react.createContext<{
    selectedValue: string | null;
  } | null>(null);

  return {
    Combobox: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: { value: string } | null;
    }) => (
      <ComboboxContext.Provider value={{ selectedValue: value?.value ?? null }}>
        <div data-headlessui-combobox="true">{children}</div>
      </ComboboxContext.Provider>
    ),
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

import {
  filterSearchableSelectOptions,
  SearchableSelectField,
  type SearchableSelectOption,
} from "./SearchableSelectField";

const OPTIONS: SearchableSelectOption[] = [
  {
    label: "10921 - Machinery and Equipment",
    searchText: "10921 Machinery and Equipment fixed assets",
    value: "10921",
  },
  {
    label: "4000 - Consulting services",
    searchText: "4000 Consulting services expense",
    value: "4000",
  },
  {
    label: "MONITOR-ALT - Monitor alt",
    searchText: "MONITOR-ALT Monitor alt pcs",
    value: "MONITOR-ALT",
  },
];

it("returns all options when the search query is blank", () => {
  expect(filterSearchableSelectOptions(OPTIONS, "   ")).toEqual(OPTIONS);
});

it("matches options by code or descriptive text", () => {
  expect(filterSearchableSelectOptions(OPTIONS, "10921")).toEqual([OPTIONS[0]]);
  expect(filterSearchableSelectOptions(OPTIONS, "consulting")).toEqual([
    OPTIONS[1],
  ]);
});

it("requires all search tokens to be present", () => {
  expect(filterSearchableSelectOptions(OPTIONS, "monitor pcs")).toEqual([
    OPTIONS[2],
  ]);
  expect(filterSearchableSelectOptions(OPTIONS, "monitor services")).toEqual(
    [],
  );
});

it("renders a single visible combobox field plus a hidden synced select", () => {
  const markup = renderToStaticMarkup(
    <SearchableSelectField
      options={OPTIONS}
      placeholder="Select account"
      searchAriaLabel="Search purchase accounts"
      value="4000"
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('aria-label="Search purchase accounts"');
  expect(markup).toContain('data-headlessui-combobox="true"');
  expect(markup).toContain(">4000 - Consulting services<");
  expect(markup).toContain('class="sr-only"');
  expect(markup).not.toContain("Open search purchase accounts");
  expect(markup).not.toContain("Type to filter accounts by code or name");
});

it("renders the placeholder as a visible selectable option", () => {
  const markup = renderToStaticMarkup(
    <SearchableSelectField
      options={OPTIONS}
      placeholder="No VAT code"
      searchAriaLabel="Search VAT codes"
      value=""
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain(">No VAT code<");
  expect(markup).toContain("Selected");
});

it("renders an empty hidden select option and disabled state", () => {
  const markup = renderToStaticMarkup(
    <SearchableSelectField
      disabled
      options={[]}
      placeholder="Select article"
      searchAriaLabel="Search accounting articles"
      value=""
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('aria-label="Search accounting articles"');
  expect(markup).toContain(">Select article<");
  expect(markup).toContain("disabled");
});
