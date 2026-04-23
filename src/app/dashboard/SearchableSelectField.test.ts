import { expect, it } from "vitest";
import {
  filterSearchableSelectOptions,
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
  expect(filterSearchableSelectOptions(OPTIONS, "10921")).toEqual([
    OPTIONS[0],
  ]);
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
