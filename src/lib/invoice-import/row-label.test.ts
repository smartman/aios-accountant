import { describe, expect, it } from "vitest";
import { formatInvoiceImportRowLabel } from "./row-label";

describe("formatInvoiceImportRowLabel", () => {
  it("formats row-N identifiers into human-readable labels", () => {
    expect(formatInvoiceImportRowLabel("row-1")).toBe("Row 1");
    expect(formatInvoiceImportRowLabel("row-12")).toBe("Row 12");
  });

  it("returns non-matching identifiers unchanged", () => {
    expect(formatInvoiceImportRowLabel("custom-row")).toBe("custom-row");
  });
});
