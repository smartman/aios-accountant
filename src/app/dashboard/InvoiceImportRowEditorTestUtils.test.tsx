import { expect, it } from "vitest";
import {
  buildPreview,
  findControlByLabel,
  renderTree,
} from "./InvoiceImportRowEditorTestUtils";

it("throws when a label cannot be found", () => {
  expect(() =>
    findControlByLabel(renderTree(buildPreview()), "Missing label", "select"),
  ).toThrow('Expected label "Missing label" to exist.');
});

it("throws when the requested control type does not exist under a label", () => {
  expect(() =>
    findControlByLabel(renderTree(buildPreview()), "Reviewed", "select"),
  ).toThrow('Expected select for label "Reviewed".');
});
